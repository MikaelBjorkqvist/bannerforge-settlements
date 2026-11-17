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
- [x] Settlement boundary visualised (particles) and stored (square border, 2026-11-17)

## M2 — Buildings in the world
### M2a — Placement with placeholder boxes (done, play-tested 2026-11-15)
- [x] Town border that grows with the tier; "Show town border" in the ledger (2026-11-17: square, 48 / 72 / 96)
- [x] Free placement inside the border: plot follows the player, entrance faces the player; Sneak tap → Build / Rotate / Move / Cancel
- [x] Green / orange / red survey with reasons: border, overlap, bell, water, hillside, steep, room above (level 3), vanilla houses (clear for a fee)
- [x] Foundation fitting: cut up to 4, fill up to 8 blocks with the local ground; garden surface copies the surroundings
- [x] Construction in 4 phases over one in-game day, time-based catch-up, scaffolding, stored items packed into barrels
- [x] Sites protected from breaking, placing and explosions; `/scriptevent bannerforge:build_finish` and `build_next`
- [x] Upgrades rebuild on the plot; the level counts when construction finishes (2026-11-17: only when a level design exists; levels themselves being removed)
- [x] Upgrades pack stored items and player-added blocks into barrels by the entrance (owner decision B)
- [ ] Docks need water: per-building placement rules (later)
- [ ] Defences (perimeter) are placed in M3
### M2b — Design workflow (style guide → blueprint → `.mcstructure` + previews)
- [x] Python toolkit, QA, previews, generated blueprint module checked in CI
- [x] Faction banner blocks (Kingscross, Amberwood, Brimstone)
- [x] Generated houses tried and dropped (owner, 2026-11-16): the owner builds structures in game instead
### M2c — Owner-built structures (one design per building, no levels for now)
- [x] Structure list validated by the owner (shared Sheet)
- [x] Importer: `.mcstructure` → blueprint, faction colours, tested on the owner's first house (PR #19/#21)
- [x] Owner's first house is the placeholder for every non-defence building (PR #21)
- [x] Plots exactly as big as the structure, may touch; line-box placement following the crosshair; square border shown like the world border (PR #22)
- [ ] The 17 Kingscross structures in game
- [x] Tiers reworked without building levels: promotion button by prosperity, population and defence points; no building locks (PR #24)

## M2.5 — Citizens
- [ ] Faction citizen prototype: our own NPC that sleeps, works and meets at the bell like villagers, wearing our skin
- [ ] Buildings bring their worker; population slots from houses; unstaffed buildings shown in the ledger
- [ ] Settlers arrive while housing is free
- [ ] Recruiting vanilla villagers through the steward (optional)
- [ ] NPC ranks: tier cap + quests (quests once the citizen systems exist)

## M3 — Walls and gates
## M4 — Civic buildings: houses, tavern, stores (+ shopkeepers)
## M5 — Military: barracks, guards, patrols
## M6 — Tiers: village → town → city, adventurers and missions
## M7 — Marketplace polish: balancing, localisation, performance pass, store art
