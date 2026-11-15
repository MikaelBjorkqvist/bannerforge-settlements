# Roadmap — BannerForge: Settlements

Milestones are small and each ends with something playable. Scope after M2 will change as the design settles.

## M0 — Pipeline proven (v0.1.0)
- [x] Repo, CI, release workflow, validator
- [x] Steward's Charter item (craft: paper + emerald + feather)
- [x] Use the charter near a village bell → claim form (name + faction) → steward menu (faction, tier, prosperity)
- [x] Settlements saved per world (dynamic properties, schema v1)
- [x] Upgrade ledger: steward lets you buy building levels 1–3 for emeralds; prosperity and tier (village/town/city) update
- [x] Loaded in-game on the owner's PC; CI green on GitHub; Mojang Creator Tools validation clean

## M0.5 — Settlement rules
- [x] Approved plan (docs/BUILDINGS.md) as data: 19 buildings, tier caps, prerequisites, repeatables, population, promotion via Town Hall
- [x] Rules engine with unit tests (`npm test`, runs in CI)
- [x] Play-tested (UI tuned over 4 rounds); numbers still placeholders
- [x] Released as v0.1.0

## M1 — The steward
- [x] Ringing a village bell calls the steward (charter dropped)
- [x] Founding fee: 10 emeralds
- [x] `bannerforge_settlements:steward` NPC: appears at the bell when rung (neutral outfit until founding, then the faction's), lives near the bell; talking opens founding / the ledger
- [x] Steward death: ledger closed for one in-game day, bell shows the time left, steward returns
- [x] Layered NPC textures (skin, outfit, profession, rank) and "Profession, Name" names
- [ ] Steward moves into the Town Hall once it is built (needs physical buildings, M2)
- [ ] Villages with several bells: the steward returns to the founding bell, even when another bell is rung
      (play-test 2026-11-15, harmless for now). Option: return to the bell that was rung, or treat every bell in the settlement as its bell
- [ ] Faction banner placed at the bell; faction names/colours decided
- [ ] Settlement boundary visualised (particles) and stored

## M2 — Buildings in the world
### M2a — Placement with placeholder boxes (in play-test)
- [x] Town border that grows with the tier (village 40, town 64, city 96 blocks); "Show town border" in the ledger
- [x] Free placement inside the border: plot follows the player, entrance faces the player; Sneak tap → Build / Rotate / Move / Cancel
- [x] Green / orange / red survey with reasons: border, overlap, bell, water, hillside, steep, room above (level 3), vanilla houses (clear for a fee)
- [x] Foundation fitting: cut up to 4, fill up to 8 blocks with the local ground; garden surface copies the surroundings
- [x] Construction in 4 phases over one in-game day, time-based catch-up, scaffolding, stored items packed into barrels
- [x] Sites protected from breaking, placing and explosions; `/scriptevent bannerforge:build_finish` and `build_next`
- [x] Upgrades rebuild on the plot; the level counts when construction finishes
- [x] Upgrades pack stored items and player-added blocks into barrels by the entrance (owner decision B)
- [ ] Docks need water: per-building placement rules (later)
- [ ] Defences (perimeter) are placed in M3
### M2b — Design workflow (style guide → blueprint → `.mcstructure` + previews)
### M2c — First real building, three levels

## M3 — Walls and gates
## M4 — Civic buildings: houses, tavern, stores (+ shopkeepers)
## M5 — Military: barracks, guards, patrols
## M6 — Tiers: village → town → city, adventurers and missions
## M7 — Marketplace polish: balancing, localisation, performance pass, store art
