# Structure pipeline

How every BannerForge building goes from an idea to blocks in the game. **Follow it for every structure**, and
improve it after each one (step 7). Owner decisions, 2026-11-15: Claude generates the structures from picture
references and rules; the owner reviews (QA); the process must be repeatable and able to evolve.

## The steps

1. **Faction style guide** (once per faction): `docs/styles/<faction>.md`
   Palette by role (foundation, frame, wall, roof, window, accent...), proportions, roofs, signature details,
   how buildings grow over the 3 levels, functional rules, and do / don't. References go in
   `assets-src/references/<faction>/` with a note on what each one is for. **References are never shipped and
   never copied block for block** (original assets only, CLAUDE.md rule 3).
2. **Building brief** (once per building): `docs/structures/<faction>/<building>.md`, from
   `docs/structures/_brief_template.md`. Lot size (**from the building catalogue, `buildings.ts`**), what each level adds, entrance, required contents (beds,
   workstations), NPC spots, variants planned.
3. **Generate**: either a **generator with a gallery** (preferred for buildings that need many variants, e.g.
   houses: `python3 assets-src/structures/gallery.py 24` renders numbered candidates; the owner approves seeds;
   approved seeds are registered as variants in `build_all.py`), or a hand-written design in
   `assets-src/structures/<faction>/<building>.py`, built from the shared toolkit
   (`bfstruct.py`) and the faction palette (`<faction>/palette.py`). One function per variant returns the
   blueprints for levels 1-3. Register it in `build_all.py`.
4. **QA**: `python3 assets-src/structures/build_all.py`
   - Automatic checks (`qa.py`): fits the lot, height limit, a door with headroom, palette only, required
     contents, nothing floating, crops have water, indoor light (warning).
   - Review sheets in `assets-src/structures/previews/`: front and back three-quarter views, ground-floor
     plan with legend, notes, and a strip comparing the three levels. **The owner reviews them**; feedback
     rounds until approved.
5. **In-game check**: `/scriptevent bannerforge:preview <faction>/<building>/<variant>/<level>` places it in
   front of you instantly (no cost, no construction); `/scriptevent bannerforge:preview` lists all keys.
   Blocks the game refuses are skipped and named in the content log: fix the generator, rebuild, re-check.
6. **Ship**: the generated module (`src/scripts/settlements/generated/blueprints.ts`) is committed; CI
   rebuilds it and fails if it is out of date. Construction uses the design automatically (placeholder boxes
   remain for buildings and factions without one). Add the ASSETS.md line and a CHANGELOG line.
7. **Retrospective**: what we learned goes into the style guide, the toolkit, the QA checks or this file.
   Note it in the log below.

## Owner-built structures (imports)

Owner decision 2026-11-16: the owner builds structures by hand in game and exports them with a structure block
(**Export**, `.mcstructure`). They go in `assets-src/structures/imported/` with an entry in `imports.json`
(`front` = entrance side as built, `groundLayers` = layers sunk into the ground, 0 or 1).
`npm run structures:import` writes, per faction and plot width (S 9, M 13, L 17):
- `packs/BP/structures/bannerforge_settlements/<design>_<faction>_<w>.mcstructure`: centred on the plot, the rest
  structure void (the ground stays). Faction colours: **white wall banners → faction banner blocks** (top + bottom),
  **white beds, wool, carpet and cushions → faction colour**. A sign that says `[HOUSE NAME]` gets the building's name.
- `src/scripts/settlements/generated/imported.ts`: a south-facing blueprint for the construction phases, and the
  structure id. When the building is finished the structure is placed over it (`world.structureManager.place`),
  which brings what scripts can't set: bed colours, cushions, chest / bookshelf contents, pot plants.

Export rules: start the box at the building's lowest layer; fill the ground-layer spots that aren't part of the
build with **structure void**; leave "Remove Blocks" off; include entities only for cushions and the like.
`imports.json` `placeholderFor: "all"` makes a design the stand-in for every plot building without its own
design (the Defence section keeps its boxes). Preview: `/scriptevent bannerforge:preview imported/<design>/<faction>/<w>`.

## Conventions

- Blueprints cover the **whole lot**: building, yard, garden, fence. The building does not have to be centred;
  it can sit in a corner, with the yard where it suits the design.
- Authored **facing south**: x left to right as seen from the street, z from back (0) to street (lot size - 1),
  y 0 = ground. The game rotates blocks and their states (`src/scripts/settlements/rotate.ts`).
- `'.'` in a blueprint = leave empty. At y 0, empty means the local ground stays (grass, sand...).
- **Variants**: several designs per building (`a`, `b`, ...), so villages are not copy-paste. A random one is
  picked when placing; the player can switch with **Design ⟳**. Upgrades keep the variant.
- Plot widths are fixed per building (S 9, M 13, L 17). Height may grow per level.
- Block ids and states are Bedrock's (e.g. oak door = `wooden_door` with `minecraft:cardinal_direction`,
  stairs use `weirdo_direction`). The toolkit helpers (`stairs`, `door_pair`, `bed_pair`, `facing`...) know them.
- Functional rules (owner: concept art is direction, not a build plan): fences don't run into walls,
  doors have two free blocks, beds fit, crops have water within 4 blocks, leaves are persistent, every room is lit.

## Biomes

A biome style is **faction DNA + biome climate rules**, not just a block swap (owner, 2026-11-15): desert houses
get flat roofs, thick walls and small windows; taiga and snowy ones steep roofs and heavy logs; savanna wide
overhangs and verandas. Each biome gets its own rule set in the generator; palettes still swap per role.

## Known limits

- Vanilla banners can't be coloured or patterned from scripts, so the mod has its own faction banner blocks
  (`bannerforge_settlements:banner_<faction>`, two parts, hung on walls).
- Chests and barrels in blueprints start empty.

## Log

| Date | Structure | What changed in the pipeline |
| --- | --- | --- |
| 2026-11-15 | Pipeline v1 | Toolkit, QA, previews, generated module, in-game preview command, variants. Draft Kingscross house A as the pipeline test. |
| 2026-11-15 | Kingscross house A + B v1 | Style guide v1 from web references; shared Kingscross kit (timber walls, gable roofs with stone verges, chimney, awning, flag, crops); lesson: on narrow fronts use corner posts only, or the plaster disappears. |
| 2026-11-15 | Kingscross house A + B v2 | Houses are on M 13×13 plots (the 9×9 v1 silently fell back to placeholders). build_all.py now reads plot sizes from buildings.ts and fails on a mismatch; the game logs a warning instead of building a box quietly. |
| 2026-11-15 | Generator + gallery v1 | Kingscross house generator (`kingscross/house_gen.py`): a seed picks footprint, position, roof direction, wing, jetty with brackets, chimney, porch or awning, window planters, banners and yard features (crops, well, woodpile, hay, flowers, bench). `gallery.py` renders numbered candidates with QA; the owner approves seeds, which then become variants. Faction banner blocks added for designs. |
| 2026-11-15 | Generator v2 | Owner: v1 houses too similar, details missing. Researched building guides (docs/styles/medieval_principles.md). v2: six building types with different silhouettes, roof builder (gable, half-hipped, hipped, catslide, dormers, porch gables) with rafters and two-wood weathering, clustered stone weathering, shutters, sills/planters, jetty brackets, beam ends, trees, wells. QA counts diagonal contact as connected. |
