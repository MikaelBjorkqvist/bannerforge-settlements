# Changelog

All notable changes to this add-on. Format: [Keep a Changelog](https://keepachangelog.com/), versions: SemVer.

## [Unreleased]

### Added — citizen prototype (dev only)
- Dev menu: spawn a settler, worker or guard NPC where you stand, to try their daily life. Citizens are now full villagers underneath: settlers and workers claim a free bed, take a free vanilla job block (lectern, composter…), trade and follow the villager day; a guard stays at its post and fights monsters. For now they wear the vanilla villager look.
- Dev: `/scriptevent bannerforge:census` lists soldiers, villagers and citizens nearby with role, job, health and whether they are in bed; `/scriptevent bannerforge:convert` turns vanilla villagers within 8 blocks into citizens (same job, skin, outfit, name).
- Workers no longer take vanilla job blocks.
- Soldiers (dev menu: spawn militia / archer): their own fighters, not villagers. Melee and ranged, three ranks each with their own weapons and armour (Militia: leather and stone sword … Knight: full iron; Archer: leather and bow …). They guard the spot they were spawned at, fight monsters and whoever attacks townsfolk, and return to their post. Placeholder look: the steward model.
- **Garrisons come to life:** a finished watchtower gets its archer and a barracks its four soldiers (the Keep two), standing at the building's door in the faction's colours. Their rank follows the settlement (Village: Militia/Archer, Town: Soldier/Marksman, City: Knight/Ranger). A fallen soldier is replaced the next morning; soldiers of a building that is gone leave. Soldiers can't hurt townsfolk.
- Dev menu: "Garrisons: refill now".
- **Townsfolk are real people now:** every settler and worker in the numbers is a citizen in the world with their own name. Newcomers walk in from a safe spot near the border (by day, on dry ground, with no monsters near); hired newcomers arrive as workers and never take vanilla jobs. Chat tells the people in town when someone arrives, starts work, loses their job, leaves, dies or is killed (and by what).
- **The steward walks to the bell** too, a new one and one returning after death: they appear a short walk away and come over. Ringing the bell meanwhile says they are on the way.
- **Vanilla villagers join the town:** every villager inside the border becomes a citizen with a name, keeping their profession, skin and biome outfit (their trade level starts over). Villagers born, cured or wandering in later join too. The ledger counts them as "Villagers"; chat says who joined and when one dies.
- **Vanilla village houses join too:** the small, medium and big houses of a converted village are recognised (all 51 vanilla designs in five biomes) and adopted as house sites. Their beds count as Housing, the villagers living there count as Population, and each house gets a faction banner by its front door. Loose beds that aren't part of a house never count. Checked once a day: a house that is torn down stops counting.
- Dev: `/scriptevent bannerforge:houses` lists the recognised vanilla houses and loose beds, and looks again for adoption.
- Dev: `/scriptevent bannerforge:roster` lists the town's people; `/scriptevent bannerforge:dawn` runs the morning for the nearest settlement.

## [0.2.0] - 2026-11-18

### Changed — categories and scores (owner, 2026-11-18)
- The ledger's sections are **Housing, Economy, Military and Civic**. Economy has Shops, Craftsmen and Food inside.
- **Prosperity** is now the sum of three scores: Economy (staffed shops, craftsmen, food), Military (defence of towers, barracks and the Keep) and Civic (Town Hall, shrine). The overview shows all three.
- Growing needs a Town Hall, Prosperity, Population and a minimum Military: Town 26 / 6 / 4, City 52 / 14 / 12.
- "A Town gets" is worked out from the real numbers: bigger town area (145 × 145 blocks, was 97 × 97), 3 more watchtowers (6 in total), 1 more barracks (2 in total), Captain training (later), worker ranks (later).
- Garrisons no longer rank up by themselves when the town grows: a Captain will train them (coming later).

### Added — townsfolk, step 1 (numbers)
- **Settlers** move into every free bed at dawn (from 7:00, never in the evening or at night). A house finished in the evening fills the next morning.
- **Jobs**: free settlers start work at buildings that need a worker, automatically. A worker keeps their job while the building stands; if it's gone they are free again.
- A building without its worker gives **no prosperity** until someone starts work there. The ledger shows waiting buildings.
- When people outnumber beds, the unemployed leave first at dawn, then the newest workers.
- **Population** for promotion is the townsfolk who actually live there (free settlers and workers), not the number of beds.
- The ledger's front page is a town overview: prosperity, defence, population, housing, workers, unemployed and garrison, with warnings (room for settlers, buildings waiting for a worker). "Grow into a Town" opens its own page: requirements, what the new tier brings, and "Upgrade now". Houses show "Housing +2". Chat tells you when settlers arrive, leave or start work.
- Dev menu: "+1 settler" (needs a free bed) and "Dawn now".

### Fixed / changed — play-test 2026-11-17 evening
- Doors, beds, torches and other blocks that hang on something no longer pop off during construction: they go in when the building is finished.
- When placing, aim at where the entrance should be: the building goes behind it.
- The "Upgrade to Town" button shows the tier name.
- Military lives in its own building: barracks (4), watchtowers (1) and the Keep (2) have a **garrison** that needs no free townsfolk and isn't counted as population. Its rank follows the tier (militia, soldiers, knights; archer, marksman, ranger).
- Barracks and watchtowers use the placeholder house like every other building.
- The Building Plan goes straight into your hand; whatever you held moves to a free slot and comes back afterwards. With a full inventory you're asked to free a slot first.
- Becoming a Town or City is celebrated: a title for everyone around and fireworks in the faction's colour over the bell.

### Added — developer tools
- Dev menu for play-testing: `/scriptevent bannerforge:dev` (cheats on). Finish construction or skip a phase nearby, +1 day, skip to morning, +64 emeralds, promote now or back to Village; settlers once the citizens exist. Can also show a "Dev tools" button in the steward's ledger.

### Changed — progression (owner, 2026-11-17)
- Buildings have one level: no more upgrades, and nothing is locked by tier. Every building can be built from the start.
- Becoming a Town or City is a button in the steward's ledger ("Upgrade to Town"), shown with a checklist: a Town Hall, prosperity, population and **defence points**. Town: 22 prosperity, 6 population, 4 defence. City: 40, 14, 12.
- Defence points come from the new **Watchtower** (2 each, 3 / 6 / 10 per tier), the Barracks (4; garrison of 4, one per Village, two per Town, three per City) and the Keep (6). The old "Defences" purchase is gone until walls and gates are designed.
- Buildings that need a worker can be built even when nobody is free; the ledger warns that it will wait for a worker.
- Houses have no limit, but each costs 1 emerald more than the last. A house sleeps one person per bed in its design (your plains house: 2).
- Population is what the houses hold, plus the garrisons, who sleep in their barracks and towers and need no house beds.
### Added
- The steward is now a villager-like NPC who lives by the village bell, named "Steward, <name>".
  - Ringing the bell calls the steward to it. It no longer opens a menu.
  - At an unclaimed village a steward in plain clothes appears. Talk to them to found a settlement; they then wear your faction's colours.
  - At your settlement, talk to the steward to open the ledger.
  - The steward can die. The ledger is closed until they return one in-game day (20 minutes) later. Ringing the bell meanwhile tells you how long is left.
- Settlements from v0.1.0 get a steward the next time you ring their bell.
- Buildings now stand in the world (placeholder boxes for now):
  - Pressing Build in the ledger lets you place the building yourself inside the town border. The plot follows you, its entrance facing you.
  - The outline is green when you can build, orange when an old village house would be cleared (for a fee), and red with the reason when you can't.
  - Tap Sneak for Build, Rotate, Move or Cancel. Your other buildings and the nearby town border are outlined too.
  - The ground is levelled and a foundation of the local ground is filled under the building.
  - Construction takes one in-game day in four phases, and continues while you are away.
  - Items stored in chests on the plot, and on upgrades your own added blocks, are packed into barrels by the entrance.
  - Chat shows each finished phase and when the building is ready. Sleeping through the night counts toward construction.
- Every building except Defences and Barracks now uses a hand-built plains house as its placeholder, in every faction, with the faction's banners, bed and cushion colours. The building's name is on its sign.
  - Construction sites can't be broken, built on or blown up.
  - Upgrades rebuild the building on its plot; the new level counts when it is finished.
  - "Show town border" in the ledger.
- Buildings bought before this version can be placed for free from the ledger ("Place building").
- The first designed building: Kingscross Guild houses in two designs (house at the back or in the corner), three levels each, with real crop gardens. Other buildings and factions still use placeholder boxes.
- The placement panel has a Design button when a building has more than one design.
### Changed
- A Town now needs 22 prosperity (was 30).
- Upgrading a building (including the Town Hall promotions) no longer rebuilds it: it keeps its current look and the new level counts at once. Only a building with its own design for the new level will be rebuilt.
- A building's plot is now exactly as big as the building (the hand-built plains house is 7 × 9), not a fixed 9 / 13 / 17 square. Its outline matches the house that will stand there.
- The plot goes where you look (the block under your crosshair, up to 48 blocks away), not just in front of your feet; looking further or at the sky keeps it 48 blocks away in the direction you look.
- Placement outlines are thin see-through lines instead of dots: the plot is a box the size and height of the building that follows you smoothly, with an arrow out of the entrance. Your other buildings and nearby village houses show as fixed boxes of their real size.
- Buildings can stand right next to each other (no 1-block gap).
- The town border is now a square around the bell that grows with the settlement: 48 blocks to each side for a village, 72 for a town, 96 for a city (it was 160 for all). New settlements need their bell at least 192 blocks from another's. While you place a building the whole border shows as a see-through white striped wall, like the world border. "Show town border" in the ledger shows it too.
- Items packed up from a plot go into barrels just in front of the building (and any that don't fit are dropped by the door instead of being lost).
### Fixed
- Ringing the bell several times no longer spawns extra stewards.
- Founding now completes after you pay (it took the emeralds and stopped before).
- The steward renders with a head (simple placeholder textures for now).
### Changed
- The ledger no longer has a separate Close button; use the X in the top-right corner.

## [0.1.0] - 2026-11-15
### Added
- Faction names: Amberwood Order (green), Kingscross Guild (blue), Brimstone Legion (red).
  The founding form shows each faction with its colour.
- Ring a village bell to call its steward. At an unclaimed village the steward offers to found a settlement:
  pick a name and a faction banner. Founding costs 10 emeralds. At your own settlement, ringing the bell opens the steward's menu.
- The steward's ledger has three short screens (Overview → Section → Building):
  - Overview: faction and town name, a warning when jobs wait for homes, the next-tier checklist, and section buttons with icons.
  - Section: one short row per building with an icon and a symbol: + build, ▲ upgrade, ✔ done for this tier, ✘ locked.
  - Short button text that fits on one line, and no misleading counts.
  - Icons appear on buttons only (no picture rows), and there's space between the text and the buy button.
  - The buy button stays greyed out until you can afford it, and says how many emeralds you're missing.
  - Building: what you have now and what the next level adds (level name in white, a short grey line under it), what's missing, cost vs your emeralds, and one clear button.
  - The result appears right above the button, with a sound.
  - Every screen has a "← Back" button.
- Buildings and upgrades that add workers need free population slots. Houses raise the population limit.
- Sections: Town Centre, Population, Trade (with Craftsmen), Food, Defence.
- Settlement rules from the approved plan (docs/BUILDINGS.md):
  - 17 buildings with 3 levels each, capped by tier.
  - Prerequisites and a house limit per tier.
  - Population and population limit.
  - Promotion through the Town Hall.
- Walls, gates and towers are one item, Defences, that upgrades the whole perimeter.
- Original pixel icons for every building and section, plus banners for the three factions.
- Buildings don't appear in the world yet.