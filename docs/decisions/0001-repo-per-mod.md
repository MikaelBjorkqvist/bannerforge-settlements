# 0001 — One repository per mod, shared template

Status: accepted · 2026-11-12

## Context
BannerForge may grow into several add-ons (settlements, factions, warfare…). They should be developed, versioned,
released and sold independently, but share tooling and conventions.

## Decision
- `bannerforge-template` is a GitHub *template repository* holding only tooling, CI, conventions and empty packs.
- Each mod is its own repo created from the template (`bannerforge-<mod>`), with its own UUIDs (`npm run init`),
  version, changelog and releases.
- When mods need each other, the dependent pack declares the other pack's header UUID in its manifest dependencies
  and talks to it through script events (`system.sendScriptEvent` with `bannerforge:` ids), never by importing code.
- Shared TypeScript helpers, if they appear, are copied in as a versioned `src/scripts/lib/` folder first; a separate
  package is only created once two mods need the same code.

## Consequences
Clean history and releases per mod; template improvements are ported to mods by PR.
