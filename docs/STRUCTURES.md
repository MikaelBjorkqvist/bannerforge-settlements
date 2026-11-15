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
