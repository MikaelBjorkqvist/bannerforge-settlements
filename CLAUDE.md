# CLAUDE.md — working rules for this repo

Claude is the main developer here. The owner directs and play-tests through the Claude interface.
Read this file, `docs/DESIGN.md`, `docs/ROADMAP.md` and the latest `CHANGELOG.md` section before changing anything.

## Project facts
- Namespace: `bannerforge` (every identifier, dynamic property, tag, scoreboard and lang key uses it).
- One repo per mod. Shared conventions come from `bannerforge-template`; never copy UUIDs between mods.
- Target: Minecraft Bedrock (Windows GDK build), Marketplace-quality add-on (`metadata.product_type: "addon"`).
- Script API versions and `min_engine_version` live **only** in `config/mod.json`. Manifests are generated.

## Hard rules
1. **Stable APIs only.** No `-beta` Script API versions, no experimental toggles, no beta-only modules
   (`server-net`, `server-admin`, `server-gametest`, `debug-utilities`). See `docs/decisions/0002`.
2. **Additive only.** Never override vanilla files or `minecraft:` identifiers (no edited villager.json, player.json,
   vanilla loot tables or recipes). Add new content and interact with vanilla through scripts. See `docs/decisions/0003`.
3. **Original assets only.** Every texture, model, sound and structure gets a line in `docs/ASSETS.md`
   (who made it, how, licence). No Mojang logos, no "Minecraft" in names, no ripped or AI-traced copies of others' art.
4. **No player skin / Character Creator overrides.**
5. **Lang everything.** No hard-coded user-facing English in JSON or scripts; use `RP/texts/en_US.lang` keys
   (`item.<id>`, `tile.<id>.name`, `entity.<id>.name`, `bannerforge.<feature>.<key>` for UI text with rawtext/translate).
6. **Performance.** Nothing heavy in `system.runInterval` every tick; spread big work with `system.runJob`.
   Large builds place structures in steps. Keep per-tick work O(nearby), not O(world).
7. **State** goes in namespaced dynamic properties as small JSON (`bannerforge:<thing>:<id>`), with a `schema` version
   field so saved worlds can be migrated forward.

## Layout
- `config/mod.json` — name, version, engine + API versions, UUIDs.
- `packs/BP`, `packs/RP` — pack sources (no manifest.json; files starting with `_` or `.` and `*.md` are not shipped).
- `src/scripts/**/*.ts` — TypeScript; `main.ts` is the entry. Use `.js` in relative import paths.
- Textures live under our own folder: `RP/textures/bannerforge/{items,blocks,entity}/` (Mojang cooperative add-on rule:
  never put files directly in shared folders like `textures/items/`). Same idea for sounds: `RP/sounds/bannerforge/`.
- `assets-src/` — editable sources (.bbmodel, layered art, texture generators). Shipped textures go in `packs/RP`.
- `tools/` — build, check, package, deploy, version.
- `docs/` — DESIGN, ROADMAP, ASSETS, decisions/ (ADRs: one file per decision, never rewritten, only superseded).

## Workflow
- `npm run check` → `npm run typecheck` → `npm run build` → `npm run package` (`npm run release` does all).
- Work on short-lived branches, PR into `main`; CI must be green. Releases: `npm run bump -- minor`, update CHANGELOG,
  tag `vX.Y.Z` → GitHub Release with `.mcaddon`.
- Deploy for play-testing: built `dist/*_BP` and `dist/*_RP` folders go to
  `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\development_{behavior,resource}_packs\`.
  Claude copies them through the desktop-app folder link; the owner can also run `npm run dev` locally.
- Debugging: read `%APPDATA%\Minecraft Bedrock\logs` content logs; enable Content Log in game settings.
- Every change that a player would notice gets a CHANGELOG line under `[Unreleased]`.

## Updating to a new Minecraft version
1. Read Mojang's "Update Notes for Creators" for the release.
2. Bump `scriptModules` + `minEngineVersion` in `config/mod.json` to the newest **stable** values; CI's drift check flags them.
3. Bump JSON `format_version`s only when a needed feature requires it; read migration notes first.
4. Play-test on Minecraft Preview before the release ships when possible.
