# Vanilla village template world (owner-only)

A superflat world with every vanilla village building laid out as an editable template, one row per biome.
It is a **reference for the owner's own builds**. Nothing here ships in a mod, and no vanilla data is committed.

## Pieces
| Piece | What it does |
| --- | --- |
| `tools/structures/nbt.mjs` | Dependency-free NBT reader (Java gzip big-endian; Bedrock little-endian too). |
| `tools/structures/java_to_bedrock.mjs` | Java block state → Bedrock candidates, plus `convertTemplate()` for whole templates. Reused by the future importer. |
| `tools/build_devtools.mjs` | Reads the `.nbt` files from the local Bedrock install, plans the grid, writes `dist-devtools/bannerforge_devtools_BP` (git-ignored). |
| `devtools/` | Pack config (own UUIDs) and the in-game script. Script API version follows `config/mod.json`. |

Source: `C:\XboxGames\Minecraft for Windows\Content\data\behavior_packs\vanilla\structures\village` (Java structure
templates, DataVersion ~1935). Included: `houses/`, `town_centers/`, top-level lamps and decorations (180 templates).
Left out: streets, terminators, villagers, animals.

## Build and deploy
```
npm run devtools:build -- "<path to structures\village>"   # path optional on the owner's PC
npm run devtools:deploy
```
Claude can also do both and copy the pack over the desktop folder link.

## In game
1. Create a world: **Flat** world preset, cheats on, and enable **BannerForge Dev Tools** under Behavior Packs (no
   experiments needed).
2. Stand on the ground where the grid should start. It grows towards +X (east) and +Z (south): about 560 × 130 blocks.
3. `/scriptevent bannerforge:vt_layout` lays out everything. `/scriptevent bannerforge:vt_layout plains` does one biome.
   `/scriptevent bannerforge:vt_check` only reports block states the game rejects (Content Log). `vt_stop` stops.
4. Each building gets a sign in front with its name; each row has a biome sign at its west end.

## How the translation works
- Each Java state becomes a list of Bedrock candidates (modern names and states first, pre-flattening forms
  after). The script keeps the first one `BlockPermutation.resolve()` accepts, so renames between versions don't break it.
- Jigsaw blocks become their `final_state`. Structure blocks are dropped.
- **Height:** a street jigsaw at template height *j* means template y = 0 goes at surface + 1 − *j*. Plains houses
  sit on the grass, desert houses and basements sink in, town centres replace the surface.
- Air is placed only at or below the surface (it carves out sunken floors); above ground, air is skipped.
- Bedrock works out stair shapes, fence, pane and bar connections, and snowy grass by itself.

## Known gaps (Bedrock keeps these in block entities, which a script permutation can't set)
- Bed colours (all beds are red), banner colours (white), flower-pot plants (empty pots), chest loot (empty).
- Facing for doors, fence gates, beds and other `cardinal_direction` blocks is mapped as Java `facing`. If a block type
  comes out turned the wrong way, report it and the table gets fixed.

## Rights
The templates are Mojang's. Using them as private reference in the owner's own world is fine, but structures
**exported from this world and shipped in a mod must be the owner's own design** (CLAUDE.md rule 3,
`docs/ASSETS.md`). Change them enough that they are new builds, not copies of the vanilla houses.
