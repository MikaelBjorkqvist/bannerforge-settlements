# Changelog

All notable changes to this add-on. Format: [Keep a Changelog](https://keepachangelog.com/), versions: SemVer.

## [Unreleased]
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