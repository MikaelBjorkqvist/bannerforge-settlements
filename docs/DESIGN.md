# BannerForge: Settlements — Design

Status: **concept**. Owner's direction is recorded as written; Claude's technical notes are marked *Tech*.

## Pitch
Take over existing villages under a faction banner and grow them into towns and cities. Do this by commissioning
walls, gates, towers and civic buildings through the village steward. Growth brings new NPCs, patrols,
shops and missions.

## Core loop
1. Claim a village with a **Steward's Charter**. The founding player **chooses the faction** (Green, Red or Blue) when founding the settlement.
2. Talk to the **steward** to commission or upgrade buildings, paying in **emeralds**. Other resources are added later.
3. Buildings appear around the village and add **prosperity**.
4. Prosperity and buildings raise the **settlement tier**: Village → Town → City (more tiers possible).
5. Higher tiers unlock NPCs (shopkeepers, guards, adventurers), patrols and missions.

## Decisions log
| Date | Decision |
| --- | --- |
| 2026-11-12 | The player chooses the faction when founding a settlement. There is no "unaligned" option. |
| 2026-11-12 | Emeralds are the main currency. Upgrades cost emeralds for now; other resources come later. All prices are placeholders in `src/scripts/settlements/buildings.ts`. |

## Factions
Three factions: **Green**, **Red** and **Blue**. Each has a name (e.g. *Ironwood Clan*). Final names, lore and
any gameplay differences are open.

## Buildings
Each building has 3 levels: **1 Basic → 2 Improved → 3 Advanced**.

| Category | Buildings (first list) |
| --- | --- |
| Defence | Walls, gates, towers, barracks |
| Civic / economy | Houses, tavern, stores |

## Settlement tiers and prosperity
Village → Town → City. Prosperity comes from building count and level. Exact thresholds are open.

## NPCs and AI
Shopkeepers, military (guards, patrols), adventurers and mission givers. The exact roster is open.

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
1. ~~Who picks the faction?~~ The founder does (decided). Still open: can it change later, through conquest or diplomacy?
2. Faction names, colours and banner patterns, and whether factions play differently.
3. ~~Upgrade currency?~~ Emeralds (decided). Still open: which other resources get added, and when?
4. Tier thresholds and the tier list beyond City (Castle? Capital?).
5. Multiplayer: can several players own or contribute to one settlement?
6. Can enemies (raids, rival factions) damage buildings or lower prosperity?
7. Is the steward spawned at claim time (new NPC at the bell) or converted from an existing villager? *Tech:
   a new NPC is the additive-safe option.*
