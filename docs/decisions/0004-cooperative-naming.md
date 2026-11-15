# 0004 — Cooperative add-on naming: `bannerforge_<mod>` for content, one texture folder per mod

Status: accepted · 2026-11-15 · refines 0003 (namespace part)

## Context
Mojang Creator Tools' cooperative add-on checks (run in CI) flagged the first entity:
- identifiers must look like `creatorshortname_projectshortname:thing`, not `bannerforge:thing`;
- geometry, animation and render controller names must look like `geometry.creatorshortname_projectshortname...`;
- `textures/<creator>/` may hold only one game folder (plus `common`).
Nothing with an identifier had shipped yet (v0.1.0 has no entities, items or blocks), so changing now breaks no worlds.

## Decision
- Content identifiers use `bannerforge_<mod id>:`, e.g. `bannerforge_settlements:steward`.
  Resource names follow: `geometry.bannerforge_settlements.npc`, `animation.bannerforge_settlements.npc_walk`,
  `controller.render.bannerforge_settlements.npc`. Entity properties use the same prefix.
- Textures live in `RP/textures/bannerforge/<mod id>/...` (UI icons in `.../ui/`, NPC layers in `.../entity/npc/`).
  Shared textures for several mods would go in `textures/bannerforge/common/`.
- Script-side names stay `bannerforge:` (dynamic properties, scriptevent ids, scoreboards, UI lang keys).
  They are not checked by the cooperative rules and existing saves already use them.
- `tools/check.mjs` enforces both rules.

## Consequences
Lang keys for content follow the identifier (`entity.bannerforge_settlements:steward.name`). Future mods get
their own prefix automatically from `config/mod.json` (`namespace` + `id`).
