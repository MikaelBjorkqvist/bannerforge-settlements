# 0002 — Stable Script API and no experimental toggles

Status: accepted · 2026-11-12

## Context
Beta Script APIs and experimental toggles change or disappear between Minecraft releases and are not suitable for
Marketplace content. Stable modules follow semantic versioning: same-major versions keep working.

## Decision
- Depend only on stable versions of `@minecraft/server` and `@minecraft/server-ui` (pinned in `config/mod.json`).
- At each release, pin the newest stable version the current Minecraft release supports.
- No beta-only modules; no world experiments required to run the add-on.
- `tools/check.mjs` enforces this and CI warns when a newer stable API is published.

## Consequences
Some new features arrive later (we wait for them to reach stable). In return the add-on keeps working across updates.
