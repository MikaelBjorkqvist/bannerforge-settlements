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
   `docs/structures/_brief_template.md`. Lot size, what each level adds, entrance, required contents (beds,
   workstations), NPC spots, variants planned.
3. **Generate**: `assets-src/structures/<faction>/<building>.py`, built from the shared toolkit
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

## Known limits

- Banners: their colour and pattern can't be set by scripts in the stable API, so guild colour uses wool,
  carpet or other blue blocks for now.
- Chests and barrels in blueprints start empty.

## Log

| Date | Structure | What changed in the pipeline |
| --- | --- | --- |
| 2026-11-15 | Pipeline v1 | Toolkit, QA, previews, generated module, in-game preview command, variants. Draft Kingscross house A as the pipeline test. |
| 2026-11-15 | Kingscross house A + B v1 | Style guide v1 from web references; shared Kingscross kit (timber walls, gable roofs with stone verges, chimney, awning, flag, crops); lesson: on narrow fronts use corner posts only, or the plaster disappears. |
