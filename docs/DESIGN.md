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
| 2026-11-12 | Founding costs 10 emeralds, paid to the steward. Founding happens by talking to the steward, who is neutral (no faction look) until the settlement is founded. |
| 2026-11-12 | Buildings & NPC plan v2 approved, see `BUILDINGS.md`. It covers tier caps, promotion via the Town Hall, 1-day construction, population, repairs, NPC respawn and fees. |
| 2026-11-12 | Emeralds are the main currency. Upgrades cost emeralds for now; other resources come later. All prices are placeholders in `src/scripts/settlements/buildings.ts`. |
| 2026-11-15 | Ringing the bell only calls the steward; it never opens a menu. Talking to the steward founds a settlement or opens the ledger. |
| 2026-11-15 | A dead steward closes the ledger until they return one in-game day later. Ringing the bell meanwhile says how long is left. |
| 2026-11-15 | Every mod NPC is named "Profession, Name", e.g. "Steward, Edric". |
| 2026-11-15 | NPC textures are layered like vanilla villagers: skin, outfit (neutral, faction, later biome), profession, rank. |
| 2026-11-15 | The "Town Centre" section name stays. |
| 2026-11-15 | M2 is split: M2a placement with placeholder boxes, M2b design workflow (style guide → blueprint → `.mcstructure` + previews), M2c first real building. Decide each step before building it. |
| 2026-11-15 | Placement: the steward marks ready-made lots at founding; marking your own lot comes later. |
| 2026-11-15 | Rotation: the entrance faces the way the player is facing; the player can rotate before building, with clear instructions on how to rotate and how to build. |
| 2026-11-15 | A vanilla house inside a lot: the steward clears it for a fee when building starts. |
| 2026-11-15 | Slopes: a foundation is filled under the building down to the ground (like vanilla villages); only the inside of the plot is flattened. |
| 2026-11-15 | Placement revised: no fixed lots. A town border (grows with tier) and free placement inside it. While placing, the footprint is green (can build), orange (vanilla house: cleared for a fee) or red (blocked, with the reason); your other buildings are outlined. No suggested-spot helper for now. |
| 2026-11-15 | Overlapping one of your own buildings is never allowed (demolish it first). Room above is checked for the building's highest level. |
| 2026-11-15 | Foundation and garden fill copy the local ground around the plot (not a fixed biome set). |
| 2026-11-15 | Construction: 4 phases over one in-game day, progress based on time so it catches up after you were away; builder NPC animations later; developer command for instant builds. Sites are protected from breaking, placing and explosions while under construction. Finished buildings are breakable; the steward repairs. |
| 2026-11-15 | Placement controls: a temporary Building Plan item opens the panel (Build, Rotate, Raise, Lower, Move, Cancel); Sneak tap dropped. The action bar shows only a short status. |
| 2026-11-15 | Town border: 160 blocks for every tier. Every bell inside a border belongs to that settlement; new settlements need their border clear of others (bells at least 320 apart). |
| 2026-11-15 | Floor level: the ground at the entrance, adjustable with Raise/Lower within the cut/fill limits. |
| 2026-11-15 | Vanilla structures: smarter scan (anchor blocks + connected blocks), outlined while placing. Overriding vanilla structure files is ruled out (ADR 0003, Marketplace). Farms, wells and small water are cleared for the fee; a quarter of the plot or more under water is blocked. |
| 2026-11-15 | The founding form uses the same DDUI style as the ledger. |
| 2026-11-15 | Upgrades (option B): chest contents and blocks the player added (anything that differs from the old level's blueprint) are packed into barrels by the entrance before the rebuild. |
| 2026-11-15 | Construction and steward timers use the in-game calendar (day × 24000 + time of day), so sleeping through nights counts. |
| 2026-11-16 | Structures are built by the owner in game (superflat world, structure block export as `.mcstructure`) and imported by Claude into the blueprint pipeline. The list to build, lot sizes and export rules live in the shared Sheet "BannerForge structure build list". Generated houses are dropped. |
| 2026-11-16 | **No building levels for now:** one design per building (Kingscross first: 16 buildings + a second house design = 17 structures). Levels 2–3 may come back later; the upgrade code stays but is unused. Tier progression must be reworked without levels (open question 5). |
| 2026-11-16 | Founding works anywhere a bell is placed. A real generated village is a head start (villagers to recruit, vanilla houses to adopt later); a wilderness town costs more and starts empty. Bells at least 320 apart still applies *(2026-11-17: 192, square borders)*. |
| 2026-11-16 | Buildings bring their worker: when a building finishes, its specialist arrives (smith, guards, archers...). Each worker takes one population slot. An idle settler takes a new job first; otherwise a new specialist arrives if a slot is free; otherwise the building is unstaffed and the ledger asks for more housing. |
| 2026-11-16 | Population counts only the faction's own people. Unrecruited vanilla villagers are "locals": they keep their own beds and life and never block slots. |
| 2026-11-16 | Recruiting (optional, the player's choice): the steward can put a nearby vanilla villager into a free job slot for a smaller fee; it becomes a faction citizen. Villagers are never converted automatically, and vanilla villager files are never changed (ADR 0003). |
| 2026-11-16 | Settlers: while a town has free housing (and enough prosperity), a settler arrives now and then (e.g. one per in-game day). Settlers fill houses, count as population and are the town's reserve workforce. |
| 2026-11-16 | Faction citizens are our own NPC entity. A prototype must prove that it joins village life (beds, work, the bell); if not, recruited vanilla villagers stay vanilla and are only marked by script. |
| 2026-11-16 | **Progression without building levels:** built structures give prosperity (houses also give population) → promotion to Town and City at the Town Hall when prosperity, population and key buildings are met (no rebuild) → each tier unlocks new buildings and the next NPC rank. |
| 2026-11-16 | **NPC ranks** (e.g. Apprentice → Journeyman → Master; Recruit → Soldier → Veteran): the town tier caps the rank; a rank-up comes from an NPC quest (deliver the items the NPC asks for; higher tiers ask for rarer items and give better rewards). A rank-up changes the badge and name and improves trades or stats. Experience from work and paying the steward are possible extras, to decide later. |
| 2026-11-16 | No tier restrictions on buildings for now: every building can be built from the start; locks can be added later once it's clear what to lock. Prosperity thresholds are set by play-testing. NPC quests wait until the citizen systems exist. |
| 2026-11-17 | Town border is a **square** around the bell (easier for defences later), growing with the tier: **48 / 72 / 96** blocks to each side (97, 145, 193 across); supersedes the fixed 160. Bells within 96 belong to the settlement; bells at least 192 apart so every village can become a city. Shown while placing like the world border: a white striped wall all round. Plots are exactly as big as their structure and may touch. Defences (walls, gates, towers, keep) not decided yet: a wall-building interface is being considered. |
| 2026-11-17 | Placement visuals: the plot is a see-through line box of the building's size and height that follows the crosshair (up to 48 blocks); your other buildings and village houses show as fixed boxes; the border is a faint white striped wall like the world border (particles only; far parts out of particle range are accepted). |
| 2026-11-17 | Upgrades never rebuild a building unless the owner made a design for the new level; the building keeps its model. |
| 2026-11-17 | **No building tiers (levels) at all for now:** every building has one level. Promotion to Town / City is a button at the steward, offered when the prerequisites are met: **prosperity, population and defence points**. Town needs 22 prosperity (play-test). |
| 2026-11-17 | **Defence points** replace defence-building prerequisites: towers, barracks and other defensive buildings each give defence points. The wall / gate / tower system (with a wall-building interface so the player designs it) and the Keep are not decided yet. |
| 2026-11-17 | No tier locks on buildings at this point (reconfirmed). |
| 2026-11-17 | Military garrisons keep their size and rise in rank with the tier: Barracks 4 militia → soldiers → knights; Watchtower 1 archer → marksman → ranger. Bigger towns may build more barracks (1 / 2 / 3) and towers (3 / 6 / 10). Civilian NPCs rank up 1 → 3 through a small quest once the tier allows it. |
| 2026-11-17 | **Garrisons sleep in their own building**: barracks bunks for its 4, a bed in each watchtower for its archer. They don't take house beds, arrive like settlers (daytime) when the building is finished, count as population, and leave or become free settlers if their building is destroyed. |
| 2026-11-17 | **Housing:** no house limit; each house costs 1 emerald more than the last; a house sleeps as many people as its design has beds (only mod houses count, vanilla beds don't). When people outnumber beds, the unemployed leave first at dawn, workers stay as long as possible. |

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

## NPCs: names and looks
- **Names:** "Profession, Name" (e.g. "Steward, Edric"). The personal name comes from the pool in
  `src/scripts/settlements/npc.ts`. Name tags are plain strings and can't be translated, so the profession word in
  them is a documented exception to the lang rule. Everything else the NPC says uses lang keys.
- **Layers** (`assets-src/entity/make_npc.py`, drawn on our own `geometry.bannerforge_settlements.npc`), stacked at runtime with
  the vanilla `villager_v2_masked` material, the same way villagers stack biome and profession:
  1. **Skin** (`skin_<n>`): skin tone, face, hair. Picked per NPC for variety (entity property `bannerforge_settlements:skin`).
  2. **Outfit** (`outfit_<id>`): neutral before founding, then the faction's; later one per faction and biome
     (`bannerforge_settlements:outfit`).
  3. **Profession** (`prof_<id>`): what the job adds, e.g. the steward's tabard, chain of office and cap.
  4. **Rank** (`rank_<n>`): badge, empty for now (`bannerforge_settlements:rank`).
- With layers, 5 biomes × 3 factions need about 15 outfits plus one overlay per profession, not one texture per combination.
- **For now** (owner, 2026-11-15: art and NPC behaviour are priority 2) the game ships flat placeholder textures, one per
  outfit, stacked at build time by `make_npc.py`. Runtime layering with `villager_v2_masked` comes back with the real art.

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
5. ~~Tiers without building levels~~ Decided 2026-11-16 (see the decisions log): no building locks for now; thresholds by play-testing.
6. NPC ranks: decided in outline 2026-11-16 (tier cap + quests). Still open: the quests per role, rewards, and whether rank-ups add prosperity.
7. Multiplayer: can several players own or contribute to one settlement?
8. Defences: wall / gate / tower system and its building interface, the Keep's role, defence point values and thresholds.
