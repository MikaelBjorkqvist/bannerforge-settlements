# BannerForge Settlements — Buildings & NPC Plan

Status: **approved** (v2, 2026-11-12, Mikael). Source of truth for building and NPC game data.
Editable working copy: the claude.ai doc "BannerForge Settlements — Buildings & NPC Plan (v2)". Changes are agreed
there first, then copied here. All numbers are placeholders until play-testing.

## Implementation status (2026-11-12)
Changed after play-test 1 (owner): walls, gates and towers merged into Defences; ledger sections renamed for players;
"population" in the House row is now the population limit.

Implemented in `src/scripts/settlements/buildings.ts` (data) and `rules.ts` (logic, unit-tested):
- the catalogue, tier caps, the Town Hall exception and promotion;
- prerequisites, repeatable limits, population and housing;
- prosperity, which is derived from levels, so rebalancing updates existing worlds;
- the Stonemason and Woodcarver discounts.

Emerald costs are placeholders set in `buildings.ts` (this plan gives no prices yet).

Not yet implemented:
- 1-day construction and builders (with structures, M2);
- Docks "near water" check (M2);
- perimeter placement (M3): Defences is one purchase for now, and gates will be placed where roads cross;
- NPCs and repair/respawn fees (M1+).

## Building rules

Every building follows these rules, so new buildings can be added as data without new code.

1. **The steward is the only interface.** Commissioning, upgrading and reports (prosperity, population, treasury, buildings) all go through the steward NPC. Ringing the bell of an unclaimed village calls a neutral steward. Talking to the steward founds the settlement for 10 emeralds; only then does the steward take on the chosen faction's look. The steward can also **repair** any building: if a creeper, a raid or a player breaks part of it, repairing restores it to its full structure.
2. **Three levels per building:** Basic → Improved → Advanced. Each level replaces the structure on the same plot with a visibly bigger or better one. Each level takes **one in-game day** to build, while builders work on the plot; the building's effects start when it's finished.
3. **Every level does something, and every building gives prosperity.** A level must change the look *and* add gameplay: a new NPC, service, trade, defence or bonus. Each level also adds the points in its Prosperity column. Central and civic buildings (Town Hall, Keep, Shrine, Market, Tavern) give the most; walls, gates and towers give the least.
4. **The settlement tier caps building levels.** A Village can build up to Level 1, a Town up to Level 2, a City up to Level 3. Growing the settlement is what unlocks better buildings. Promotion happens at the Town Hall. When prosperity reaches the next tier's threshold and its required buildings exist, the steward offers the Town Hall upgrade, and building it promotes the Village to a Town (or the Town to a City). That's why the Town Hall may be one level above the cap.
5. **Prerequisites.** A building or level can require other buildings, for example Barracks needs Defences Level 1.
6. **Unique or repeatable.** Most buildings are unique (one per settlement). Houses are repeatable, up to a count per tier.
7. **Plots.** Each building has a fixed plot: S 9×9, M 13×13 or L 17×17 blocks. Width and depth (X/Z) stay the same at every level; only the height (Y) can grow. Plots never grow sideways, which keeps layouts under control and prevents overlap. The steward offers free plots, the player confirms the spot (outlined with particles), the ground inside is levelled, and nothing outside the plot is touched.
8. **The perimeter is its own system.** Walls, gates and towers aren't plot buildings; they are bought and upgraded together as one item, **Defences**. Walls follow the settlement border the way people would build them, with gentle curves and straight runs on flat ground. They are left out where huge cliffs or deep water already form a barrier. Gates sit where roads cross the wall, and towers stand at corners and along long stretches.
9. **Style = faction × biome.** Every structure has a faction style plus a biome variant, falling back to the faction's default. The style is locked when the settlement is founded.
10. **Vanilla stays.** Existing village houses and villagers are never demolished or changed. Our buildings go on free ground next to them.
11. **Cost.** Emeralds for now; each level has its own price. Building materials come later, and can then be paid from the Warehouse.
12. **Faction banners.** Every building, tower and gate carries one or two banners in the settlement's faction colours.

## NPC rules

Every NPC belongs to one settlement and one building, and looks like its faction and biome.

1. **Own NPCs only.** All BannerForge NPCs are new `bannerforge:` entities. Vanilla villagers are left as they are and keep living in the village.
2. **Faction × biome looks.** Each NPC role has a faction outfit plus biome variants, with the same fallback to the faction's default as buildings.
3. **Buildings bring NPCs.** Building or upgrading a building spawns its NPCs: more of them, or a higher rank, at higher levels. NPCs can die. The steward can respawn a dead NPC for a small emerald fee.
4. **One steward per settlement.** The steward lives near the village bell until the Town Hall is built, then moves there. Ringing the bell calls the steward back to it. Upgrades and reports always go through the steward, even when other NPCs offer services. The steward can be killed, and returns after one in-game day.
5. **Interaction.** Using an NPC opens a menu for its role: trades, hiring, missions or reports.
6. **Daily routine.** NPCs work at their building by day and go indoors at night. Guards and patrols stay out at night.
7. **Names.** Each NPC gets a name from its faction's name list, e.g. an Amberwood steward "Elowen Thornleaf".
8. **Population limit caps NPCs.** Population is the number of BannerForge NPCs living in the settlement; vanilla villagers don't count. Houses set the **population limit**, and every NPC that comes from a building (shopkeepers, crafters, soldiers) takes one population slot. If the cap is full, that NPC stays unfilled until there's housing. The steward is always free. There is also a hard performance cap of 24 NPCs per settlement (tunable).

## Building catalogue

There are 17 buildings in 6 ledger sections (Town Centre, Homes, Trade, Food, Craftsmen, Defence). Plot sizes are defined in rule 7; "Perimeter" means part of the wall system (rule 8). Prosperity is the points each level adds; for example, 5 / 10 / 15 means a Town Hall at Level 3 has given 30 in total. All numbers are placeholders for play-testing.

| Building | Category | Plot | L1 Basic | L2 Improved | L3 Advanced | Prosperity L1 / L2 / L3 | Requires |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Town Hall | Town Centre | M | Steward's office: reports, commission works, faction banner | Treasury (deposit emeralds for the settlement), notice board with missions | Council hall: faction-wide announcements, settlement policies | 5 / 10 / 15 | Unique. Can be one level above the tier cap. L2 needed for Town, L3 for City |
| Keep | Town Centre | L | Fortified manor: home for one or more players (beds, chests), lord's banner | Keep tower with a garrison of 2; rally point during raids | Castle with inner bailey and throne hall; needed for a future Capital | 6 / 10 / 15 | Unique. Town, Defences L1 |
| House | Homes | M | +2 population limit | +3 population limit, gardens | +4 population limit, NPC families | 1 / 2 / 3 each | Repeatable: 4 per Village, 8 per Town, 12 per City |
| Market stalls | Trade | M | General store: basic trades, food, cheaper items | More stalls: butcher, baker, farm produce; better prices | Merchant: rare and faction goods, weekly special offers | 4 / 6 / 8 | Unique |
| Tavern | Trade | M | Innkeeper: rest (set spawn), rumours, food | Hire adventurers | Bard, mission board, faction events | 4 / 6 / 8 | Unique |
| Warehouse | Trade | L | Real, physical shared storage (chests) inside the building; opened only there | Double capacity; collects Farmstead and Docks output automatically | Supplies upgrades: building costs can be paid from stock (once materials are in) | 2 / 3 / 5 | Unique |
| Farmstead | Food | L | Fields: varying food stock | Livestock pens | Granary: stores farm products automatically | 3 / 5 / 7 | Unique |
| Docks | Food | L | Fishing pier | Trade boats | Harbour | 3 / 5 / 8 | Unique. Only near water |
| Blacksmith | Craftsmen | M | Iron tools, weapons and chain armour trades; repairs | Diamond-tier gear, armour trims, upgrades | Master smith: faction weapons and armour | 3 / 5 / 7 | Unique |
| Fletcher | Craftsmen | S | Bows, arrows, leather armour | Crossbows, tipped arrows, saddles | Faction ranged weapons, enchanted bows | 2 / 4 / 6 | Unique |
| Alchemist | Craftsmen | S | Basic potions (healing, night vision), brewing ingredients | Splash and long-lasting potions, low-level enchanted books | Lingering potions, high-level enchanted books, faction elixirs | 3 / 5 / 7 | Unique |
| Stonemason | Craftsmen | M | Stone blocks: cobblestone, bricks, smooth stone | Polished and decorative stone, deepslate | Faction decorative stone; −20% on Defences upgrades | 2 / 4 / 6 | Unique |
| Woodcarver | Craftsmen | S | Logs, planks, basic wooden items | Decorative wood, boats, chests, furniture | Faction decorative wood; −20% on House and Tavern upgrades | 2 / 4 / 6 | Unique |
| Shrine | Town Centre | S | Grove shrine / chapel / ancestor hall (by faction): healing | Blessings (short buffs) | Faction relic: large prosperity bonus | 4 / 6 / 10 | Unique |
| Stables | Trade | M | Horse trades | Mount upgrades (armour) | Faction mounts | 2 / 4 / 6 | Unique. Town |
| Defences (walls, gates, towers) | Defence | Perimeter | Palisade / hedge / low stone wall (by faction), gates with doors, lookouts | Full stone wall, gatehouses with 2 guards each, archer posts | Fortified wall with walkway, portcullis gates, signal towers (raid warning) | 4 / 7 / 10 | Unique. One purchase upgrades the whole perimeter; gates go where roads cross |
| Barracks | Defence | L | Captain (recruitment) + militia: 2 guards | Upgraded to soldiers: 4, plus patrols between towers | Elite soldiers + barracks tower | 3 / 5 / 7 | Unique. Defences L1 |

## NPC roster

There are 22 NPC roles, grouped by the building they come from. Faction examples show how one role looks in each faction (Amberwood / Kingscross / Brimstone).

| NPC | Comes from | Role | Faction examples |
| --- | --- | --- | --- |
| Steward | Founding (Town Hall later) | Commission, upgrade and repair buildings; reports; respawns NPCs | Grove keeper / Reeve / Hall-thane |
| Castellan | Keep L1 | Runs the Keep; commands the garrison during raids | Highwarden / Castellan / Hold-keeper |
| Shopkeeper | Market stalls L1 | General goods and food | Forager / Grocer / Provisioner |
| Merchant | Market stalls L3 | Rare and faction goods, weekly offers | Wandering trader / Guild factor / Gem broker |
| Innkeeper | Tavern L1 | Rest, rumours, food | Brewmistress / Innkeeper / Alemaster |
| Adventurer | Tavern L2 | Hire as escort; roams and takes missions | Ranger / Sellsword / Delver |
| Bard | Tavern L3 | Missions, events, prosperity buff | Songweaver / Minstrel / Skald |
| Quartermaster | Warehouse L1 | Looks after the storage | Hoard-keeper / Quartermaster / Vault-warden |
| Farmer | Farmstead L1 | Tends fields and animals | Gardener / Farmer / Mushroom-grower |
| Dockmaster | Docks L1 | Fishing and boat trades | Riverwarden / Harbourmaster / Ferryman |
| Smith | Blacksmith L1 | Tools, weapons, armour, repairs | Thornsmith / Blacksmith / Runesmith |
| Fletcher | Fletcher L1 | Bows, arrows, leather goods | Leafbow / Fletcher / Boltwright |
| Alchemist | Alchemist L1 | Potions, enchantments | Herbalist / Apothecary / Fire-chemist |
| Stonemason | Stonemason L1 | Stone blocks, wall discounts | Stone-singer / Mason / Master hewer |
| Woodcarver | Woodcarver L1 | Wood blocks, house discounts | Woodwright / Carpenter / Timber-cutter |
| Priest | Shrine L1 | Healing, blessings | Druid / Chaplain / Ancestor-speaker |
| Stablemaster | Stables L1 | Horses, mount upgrades | Beastfriend / Stablemaster / Ram-herder |
| Captain | Barracks L1 | Recruitment; leads patrols, rallies defence in raids | Elder warden / Captain / Thane |
| Guard | Barracks L1, Defences L2 | Stands watch at gates and towers | Warden / Watchman / Shieldbearer |
| Soldier | Barracks L2 | Patrols between gates and towers | Grove sentinel / Man-at-arms / Ironguard |
| Archer | Defences L2 | Ranged defence from towers | Leafshot / Crossbowman / Bolt-thrower |
| Builder | During construction | Visual only: works on the plot during its one-day build | Shaper / Builder / Forgehand |

## Settlement tiers

Promotion needs prosperity, population and key buildings, so a settlement can't buy its way up with one building type. As a reference, building everything a Village allows gives about 60 prosperity, and everything at Level 2 gives about 190.

| Tier | Needs | Max building level | Unlocks |
| --- | --- | --- | --- |
| Village | Founding | 1 (Town Hall 2) | Steward, Basic buildings, Captain and militia |
| Town | 30 prosperity, population 6, Town Hall L2, Defences L1 | 2 (Town Hall 3) | Keep, Stables, patrols, adventurers, gatehouses |
| City | 120 prosperity, population 16, Town Hall L3, Defences L2, Barracks L2 | 3 | Elite soldiers, merchants, missions, faction relics, castle |
| Later: Capital / Stronghold | Keep L3, to decide | 3+ | One per faction per world? |

Prices and thresholds stay placeholders until play-testing.

## Decisions

Mikael answered all twelve questions on 12 Nov 2026; the rules and tables above already include the answers.

| Question | Decision |
| --- | --- |
| Tier caps | Yes: the tier caps building levels; promotion is a Town Hall upgrade at the prosperity threshold |
| Keep | Home for one or more players |
| Construction | Takes 1 in-game day per level |
| Population | Counts BannerForge NPCs only, and caps how many building NPCs (shops etc.) you can have |
| Warehouse | Real, physical storage, opened only at the building |
| Damage | No damage system for buildings; the steward repairs broken structures. NPCs can die; the steward respawns them for a small fee |
| Steward | Can be killed; returns after 1 in-game day |
| Faction-unique buildings | Not for now |
| Faction-flavoured building names | Not needed for now |
| Workshop | Dropped |

## Open questions

None right now. The last two were answered:

- **Village staffing:** Houses give +2 / +3 / +4 population, so a full Village (4 Houses) has room for 8 NPCs.
- **Fees:** repairing costs 10% of the building's last level cost; respawning an NPC costs 5 emeralds.
