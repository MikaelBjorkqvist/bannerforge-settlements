# Changelog

All notable changes to this add-on. Format: [Keep a Changelog](https://keepachangelog.com/), versions: SemVer.

## [Unreleased]
### Added
- Faction names: Amberwood Order (green), Kingscross Guild (blue), Brimstone Legion (red).
  The founding form shows each faction with its colour.
- Ring a village bell to call its steward. At an unclaimed village the steward offers to found a settlement:
  pick a name and a faction banner. Founding costs 10 emeralds. At your own settlement, ringing the bell opens the steward's menu.
- The steward's ledger has three short screens (Overview → Section → Building):
  - Overview: your faction banner, faction and town name, a warning when jobs wait for homes, the next-tier checklist, and section buttons with icons.
  - Section: one short row per building with an icon (▲ can do now, ✔ done for this tier, Locked).
  - Building: what you have now and what the next level adds, what's missing, cost vs your emeralds, and one clear button.
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