# BannerForge: Settlements — Design

Status: **concept**. Owner's direction is recorded as written; Claude's technical notes are marked *Tech*.

## Pitch
Take over existing villages under a faction banner and grow them into towns and cities. Do this by commissioning
walls, gates, towers and civic buildings through the village steward. Growth brings new NPCs, patrols,
shops and missions.

## Core loop
1. **Ring the village bell** to call the steward, who offers to found a settlement. The founding player **chooses the faction** (Green, Red or Blue). The steward lives near the bell until the Town Hall is built, then moves there.
2. Talk to the **steward** to commission or upgrade buildings, paying in **emeralds**. Other resources are added later.
3. Buildings appear around the village and add **prosperity**.
4. Prosperity and buildings raise the **settlement tier**: Village → Town → City (more tiers possible).
5. Higher tiers unlock NPCs (shopkeepers, guards, adventurers), patrols and missions.

## Decisions log
| Date | Decision |
| --- | --- |
| 2026-11-12 | The player chooses the faction when founding a settlement. There is no "unaligned" option. |
| 2026-11-12 | Factions: Amberwood Order (green), Kingscross Guild (blue), Brimstone Legion (red), with themes as listed below. |
| 2026-11-12 | Each village biome gets its own style per faction (future). |
| 2026-11-12 | Steward's Charter dropped. Ringing a village bell calls the steward (option B), who lives near the bell until the Town Hall is built. |
| 2026-11-12 | Buildings & NPC plan v2 approved, see `BUILDINGS.md`. It covers tier caps, promotion via the Town Hall, 1-day construction, population, repairs, NPC respawn and fees. |
| 2026-11-12 | Emeralds are the main currency. Upgrades cost emeralds for now; other resources come later. All prices are placeholders in `src/scripts/settlements/buildings.ts`. |

## Factions
Each faction's buildings, NPCs and banners follow its theme and visuals.

| Faction | Colour | Theme | Visuals |
| --- | --- | --- | --- |
| **Amberwood Order** | Green | Elvish(ish), nature-bound, elemental, mystical, ancient, organic, harmonious, forest-dwelling, spiritual, agile | Lush, mossy, overgrown, timber, canopy, living wood, vine-draped, emerald, earthen, rustic elegance |
| **Kingscross Guild** | Blue | Human(ish), classic medieval, grounded, neutral, industrious, mercantile, frontier, adaptable, communal, pragmatic | Timber-framed, cobblestone, thatch, brick, banner-draped, windmills, harbours, watchtowers, weathered, practical |
| **Brimstone Legion** | Red | Stout, dwarven(ish)-inspired, proud, elite, hierarchical, honourable, traditional, unyielding, wealthy, stoic | Monumental, carved stone, monolithic, fortress, subterranean, deepslate, granite, gilded, heavy masonry, grand halls |

### Biome styles (future)
Every village biome gets its own style for each faction. Vanilla villages generate in five biomes: plains,
desert, savanna, taiga and snowy. For example, a Brimstone Legion town in a desert should look different from one in a taiga.

*Tech:* full coverage means 3 factions × 5 biomes × 7 buildings × 3 levels = **315 structures**. Plan:
- The structure path includes faction and biome: `structures/bannerforge/<faction>/<biome>/<building>/level_<n>.mcstructure`.
  When a biome variant doesn't exist yet, the game falls back to `<faction>/default/`. Biome styles can then be added
  one at a time without code changes.
- First build the **default** style for each faction (the biome-neutral look described above). Add biome variants later,
  probably in the order plains → taiga → desert → savanna → snowy.
- The biome is recorded when a settlement is founded, so its style doesn't change later.

## Buildings, NPCs and tiers
The approved plan is in **[`BUILDINGS.md`](BUILDINGS.md)**: 19 buildings, 22 NPC roles, building and NPC rules, and the
Village → Town → City tiers. It is the source of truth for game data.

## Tech notes (Claude)
- **Finding villages.** The Script API has no "village" object. A vanilla village is identified by its **bell**
  (the meeting point), and the settlement is anchored to that bell (implemented in M0).
- **Placing buildings.** Each building level is a `.mcstructure`, placed with the structure manager. Uneven
  terrain is the hard part. Plan: fixed **building plots** that the player picks (shown with particles). The plot
  is levelled first, then the structure is placed in slices with `system.runJob` so the game doesn't stutter.
- **Authoring structures.** Built in-game with structure blocks or the Bedrock Editor, then exported into
  `packs/BP/structures/bannerforge/<building>/level_<n>.mcstructure`. Every structure is listed in `ASSETS.md`.
- **NPCs.** These are new `bannerforge:` entities (steward, guard, merchant, adventurer) with their own trade
  tables and behaviours. Vanilla villagers are **not** modified (ADR 0003). Patrols use script-driven waypoints
  between towers and gates.
- **Walls around irregular villages.** The wall is built from the settlement bounds as straight segments with towers
  at the corners. Its exact shape is a design-and-test item (M3).
- **Persistence.** One namespaced dynamic property per settlement holds versioned JSON. It is world-scoped, so it
  works on Realms and servers.
- **Performance budget.** Nothing per-tick over every settlement. Work happens only near players or on events.

## Open questions
1. Can a settlement's faction change later, through conquest or diplomacy?
2. Banner patterns per faction, and whether factions play differently (bonuses, NPCs).
3. Which other resources join emeralds as upgrade costs, and when?
4. The tier beyond City (Capital / Stronghold): requirements and limits.
5. Multiplayer: can several players own or contribute to one settlement?
