# 0003 — Additive-only content (no vanilla overrides)

Status: accepted · 2026-11-12

## Context
Overriding vanilla files (e.g. `villager.json`, `player.json`) breaks when Mojang updates them and conflicts with
other add-ons. Mojang's cooperative add-on guidelines and Marketplace add-on review expect additive content.

## Decision
- All content uses the `bannerforge:` namespace. No `minecraft:` identifiers are redefined.
- Vanilla things (villages, villagers, bells) are *read* and *reacted to* through scripts, not redefined.
  Example: a settlement's steward is a new `bannerforge:steward` entity, not a modified villager.

## Consequences
Some behaviours need script-side workarounds, but the add-on coexists with other add-ons and survives updates.
