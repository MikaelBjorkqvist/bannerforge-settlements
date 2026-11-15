// Construction: a building rises in 4 phases over one in-game day (owner decisions, 2026-11-15).
// Progress follows the clock, not ticks counted, so a site catches up when a player comes back.
// Sites are protected from breaking, placing and explosions while under construction.

import { gameTime } from "./clock.js";
import {
  BlockPermutation,
  BlockVolume,
  type Dimension,
  GameMode,
  ItemStack,
  type Player,
  type RawMessage,
  system,
  world,
} from "@minecraft/server";
import { blueprintByKey, blueprintFor as designFor, blueprintKeys, topHeightFor, type Blueprint } from "./blueprint.js";
import { buildingById } from "./buildings.js";
import { BUILD_TICKS, FILL_MAX, PHASES, PLACEHOLDER_HEIGHT, STEPS, footprintInFront, phaseLayers, stepsDue, toWorld, type Footprint } from "./plots.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { tier } from "./rules.js";
import { isClearable, isLiquid, localGround, readColumn } from "./terrain.js";
import { forgetVanillaIn } from "./vanilla.js";
import { buildingName, levelName, raw, t, txt } from "./text.js";
import type { BuildingLevel, Settlement, Site } from "./types.js";

/** Work happens only when a player is this close (chunks further away may not be loaded). */
const WORK_RADIUS = 80;
const TICK_INTERVAL = 20;
const BLOCKS_PER_YIELD = 48;

export const footprintOf = (site: Site): Footprint => ({ x: site.x, z: site.z, w: site.w, rot: site.rot });

/** Height of the building's tallest level, for clearing and protection. */
function topHeight(defId: string, faction: string, variant: string | undefined): number {
  const def = buildingById(defId);
  return def ? topHeightFor(def, faction, variant) : PLACEHOLDER_HEIGHT.S[2];
}

function blueprintFor(a: { defId: string; faction: string }, level: BuildingLevel, site: Site): Blueprint | undefined {
  const def = buildingById(a.defId);
  if (!def || level < 1) return undefined;
  return designFor(def, a.faction, site.variant, level as 1 | 2 | 3, site.w, site.rot);
}

// ---------- active sites (cache for protection and work) ----------

interface ActiveSite {
  sid: string;
  faction: string;
  defId: string;
  index: number;
  dim: string;
  site: Site;
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
}

let active: ActiveSite[] = [];

export function refreshActiveSites(): void {
  const list: ActiveSite[] = [];
  for (const s of allSettlements()) {
    for (const [defId, sites] of Object.entries(s.sites ?? {})) {
      sites.forEach((site, index) => {
        if (!site?.build) return;
        const box = { x0: site.x, x1: site.x + site.w - 1, y0: site.y - FILL_MAX, y1: site.y + topHeight(defId, s.faction, site.variant) + 2, z0: site.z, z1: site.z + site.w - 1 };
        list.push({ sid: s.id, faction: s.faction, defId, index, dim: s.dimension, site, box });
      });
    }
  }
  active = list;
}

function siteAt(dim: string, x: number, y: number, z: number): ActiveSite | undefined {
  return active.find((a) => a.dim === dim && x >= a.box.x0 && x <= a.box.x1 && y >= a.box.y0 && y <= a.box.y1 && z >= a.box.z0 && z <= a.box.z1);
}

/** Minutes left on a site's construction, or undefined if it isn't under construction. */
export function constructionMinutesLeft(site: Site | null | undefined): number | undefined {
  if (!site?.build) return undefined;
  const elapsed = gameTime() - site.build.start;
  return Math.max(1, Math.ceil((BUILD_TICKS - elapsed) / 1200));
}

// ---------- starting ----------

/** Starts building `to` on an existing site (new building or upgrade). Saves the settlement. */
export function startConstruction(s: Settlement, defId: string, index: number, to: BuildingLevel): void {
  const site = s.sites?.[defId]?.[index];
  if (!site) return;
  site.build = { to, start: gameTime(), done: 0 };
  saveSettlement(s);
  refreshActiveSites();
}

// ---------- the work loop ----------

const running = new Set<string>();
const keyOf = (a: ActiveSite) => `${a.sid}:${a.defId}:${a.index}`;

export function registerConstruction(): void {
  // World data can't be read while scripts first load ("early execution"): start on the first tick.
  system.run(refreshActiveSites);
  let ticks = 0;
  system.runInterval(() => {
    if (++ticks % 10 === 0) refreshActiveSites(); // picks up changes made elsewhere every 10 s
    const now = gameTime();
    for (const a of active) {
      const b = a.site.build!;
      if (running.has(keyOf(a)) || b.done >= stepsDue(now - b.start)) continue;
      const dim = world.getDimension(a.dim);
      const center = { x: a.site.x + a.site.w / 2, y: a.site.y, z: a.site.z + a.site.w / 2 };
      if (!dim.getPlayers({ location: center, maxDistance: WORK_RADIUS }).length) continue;
      running.add(keyOf(a));
      system.runJob(runStep(dim, a, b.done));
    }
  }, TICK_INTERVAL);

  registerProtection();
  registerDevCommands();
}

function* runStep(dim: Dimension, a: ActiveSite, step: number): Generator<void, void, void> {
  let ok = false;
  try {
    const level = a.site.build!.to;
    const bp = blueprintFor(a, level, a.site);
    if (!bp) return;
    if (step === 0) {
      yield* prepare(dim, a, bp);
      yield* placePhase(dim, a.site, bp, 1);
    } else if (step < PHASES) {
      yield* placePhase(dim, a.site, bp, step + 1);
    } else {
      yield* removeScaffolding(dim, a.site, bp);
    }
    ok = true;
  } catch (e) {
    // Usually an unloaded chunk: the step is simply tried again later.
    console.warn(`[BannerForge] construction step ${step} for ${a.defId}: ${String(e)}`);
  } finally {
    running.delete(keyOf(a));
  }
  if (ok) finishStep(a, step);
}

function finishStep(a: ActiveSite, step: number): void {
  const s = settlementById(a.sid);
  const site = s?.sites?.[a.defId]?.[a.index];
  if (!s || !site?.build) return;
  site.build.done = step + 1;
  if (site.build.done >= STEPS) {
    const to = site.build.to;
    const oldTier = tier(s);
    (s.buildings[a.defId] ??= [])[a.index] = to;
    site.built = to;
    delete site.build;
    saveSettlement(s);
    announceFinished(s, a, to, oldTier !== tier(s));
  } else {
    saveSettlement(s);
    if (step + 1 < STEPS) announcePhase(s, a, step + 1);
  }
  refreshActiveSites();
}

/** "⚒ House: phase 2 of 4" to players nearby, so progress is visible. */
function announcePhase(s: Settlement, a: ActiveSite, phase: number): void {
  const msg = raw(txt("§7⚒ "), buildingName(a.defId), txt(": "), t("bannerforge.build.phase", String(phase), String(PHASES)));
  for (const p of world.getDimension(a.dim).getPlayers({ location: { x: a.site.x, y: a.site.y, z: a.site.z }, maxDistance: 64 })) p.sendMessage(msg);
  void s;
}

function announceFinished(s: Settlement, a: ActiveSite, level: BuildingLevel, promoted: boolean): void {
  const msg = raw(t("bannerforge.build.finished", s.name), txt(" "), buildingName(a.defId), txt(" "), levelName(level));
  const dim = world.getDimension(a.dim);
  for (const p of dim.getPlayers({ location: { x: a.site.x, y: a.site.y, z: a.site.z }, maxDistance: 128 })) {
    p.sendMessage(msg);
    p.playSound("random.levelup", { volume: 0.6 });
  }
  if (promoted) world.sendMessage(raw(t("bannerforge.tier.promoted", s.name), txt(" "), t(`bannerforge.tier.${tier(s)}`), txt("!")));
}

// ---------- steps ----------

const badBlocks = new Set<string>();

/**
 * Places one block. An unloaded chunk throws (the step is retried later). A block the game refuses
 * (wrong id or state, play-test 2026-11-15) is skipped and logged once, so one bad block never stalls a building.
 */
function set(dim: Dimension, x: number, y: number, z: number, id: string, states?: Record<string, string | number | boolean>): void {
  const block = dim.getBlock({ x, y, z });
  if (!block) throw new Error("unloaded");
  try {
    if (states) block.setPermutation(BlockPermutation.resolve(id, states));
    else block.setType(id);
  } catch (e) {
    if (!badBlocks.has(id)) {
      badBlocks.add(id);
      console.warn(`[BannerForge] skipped block ${id}: ${String(e)}`);
    }
  }
}

const CONTAINER = /chest|barrel|shulker_box|hopper|dispenser|dropper|furnace|smoker|brewing_stand/;

/** Clear the plot, keep anything stored in containers, fill the foundation and put up scaffolding. */
function* prepare(dim: Dimension, a: ActiveSite, bp: Blueprint): Generator<void, void, void> {
  const site = a.site;
  const f = footprintOf(site);
  const floor = site.y - FILL_MAX - 4;

  // Columns: natural ground under each block of the plot.
  const grounds: number[][] = [];
  const water: boolean[][] = [];
  let cut = 0;
  for (let lx = 0; lx < f.w; lx++) {
    grounds[lx] = [];
    water[lx] = [];
    for (let lz = 0; lz < f.w; lz++) {
      const c = readColumn(dim, f.x + lx, f.z + lz, floor);
      if (!c) throw new Error("unloaded");
      grounds[lx][lz] = c.ground;
      water[lx][lz] = c.water;
      cut = Math.max(cut, c.ground - site.y);
    }
    yield;
  }
  const clearTop = site.y + Math.max(topHeight(a.defId, a.faction, site.variant), cut) + 1;
  const { surface, fill } = localGround(dim, f, floor);

  // 1. Keep stored items: empty every container in the way.
  const salvaged: ItemStack[] = [];
  let n = 0;
  for (let x = f.x; x < f.x + f.w; x++) {
    for (let z = f.z; z < f.z + f.w; z++) {
      for (let y = site.y; y <= clearTop; y++) {
        const block = dim.getBlock({ x, y, z });
        if (block && CONTAINER.test(block.typeId)) {
          const container = block.getComponent("minecraft:inventory")?.container;
          if (container) {
            for (let i = 0; i < container.size; i++) {
              const item = container.getItem(i);
              if (item) salvaged.push(item);
            }
            container.clearAll();
          }
        }
        if (++n % (BLOCKS_PER_YIELD * 4) === 0) yield;
      }
    }
  }

  // 1b. Upgrades: blocks the player added to the old building are packed up too (owner decision B,
  //     2026-11-15). Anything that differs from the old level's blueprint counts as added.
  if (site.built > 0) {
    const old = blueprintFor(a, site.built, site);
    if (old) {
      for (let ly = 0; ly <= clearTop - site.y; ly++) {
        for (let lx = 0; lx < f.w; lx++) {
          for (let lz = 0; lz < f.w; lz++) {
            const expected = old.at(lx, ly, lz);
            if (ly === 0 && !expected) continue; // garden ground
            const p = toWorld(f, lx, lz);
            const block = dim.getBlock({ x: p.x, y: site.y + ly, z: p.z });
            if (!block || isClearable(block.typeId) || block.typeId === "minecraft:scaffolding") continue;
            if (expected && expected.id === block.typeId) continue;
            const item = block.getItemStack(1);
            if (item) salvaged.push(item);
            if (++n % (BLOCKS_PER_YIELD * 4) === 0) yield;
          }
        }
      }
    }
  }

  // 2. Anyone standing on the plot steps out in front of it.
  const out = toWorld(f, Math.floor(f.w / 2), f.w + 1);
  const outY = (readColumn(dim, out.x, out.z, floor)?.ground ?? site.y) + 1;
  for (const e of dim.getEntities({ location: { x: f.x, y: site.y, z: f.z }, volume: { x: f.w - 1, y: clearTop - site.y, z: f.w - 1 } })) {
    if (e.typeId === "minecraft:item") continue;
    try {
      e.teleport({ x: out.x + 0.5, y: outY, z: out.z + 0.5 });
    } catch {
      // some entities can't be moved; they are left alone
    }
  }

  // 3. Clear everything above the plot's ground, one layer at a time.
  for (let y = site.y + 1; y <= clearTop; y++) {
    dim.fillBlocks(new BlockVolume({ x: f.x, y, z: f.z }, { x: f.x + f.w - 1, y, z: f.z + f.w - 1 }), "minecraft:air");
    yield;
  }

  // 4. Foundation down to the natural ground, and a garden surface of the local ground block.
  for (let lx = 0; lx < f.w; lx++) {
    for (let lz = 0; lz < f.w; lz++) {
      const x = f.x + lx;
      const z = f.z + lz;
      // Farm channels, wells and ponds are filled to the bottom first.
      if (water[lx][lz]) {
        for (let y = Math.min(grounds[lx][lz], site.y - 1); y > floor; y--) {
          if (!isLiquid(dim.getBlock({ x, y, z })?.typeId ?? "")) break;
          set(dim, x, y, z, fill);
        }
      }
      for (let y = grounds[lx][lz] + 1; y < site.y; y++) set(dim, x, y, z, fill);
      set(dim, x, site.y, z, surface);
    }
    yield;
  }

  forgetVanillaIn(a.sid, f);

  // 5. Scaffolding at the four corners, as tall as the building will be.
  for (const [lx, lz] of [[0, 0], [f.w - 1, 0], [0, f.w - 1], [f.w - 1, f.w - 1]]) {
    const p = toWorld(f, lx, lz);
    for (let ly = 1; ly < bp.height; ly++) set(dim, p.x, site.y + ly, p.z, "minecraft:scaffolding");
  }
  yield;

  // 6. Salvaged items go into barrels in the front garden, beside the door.
  if (salvaged.length) {
    let slot = 1;
    let barrel: ReturnType<typeof barrelAt> | undefined;
    for (const item of salvaged) {
      if (!barrel || barrel.emptySlotsCount === 0) {
        if (slot >= Math.floor(f.w / 2) - 1) break; // out of room: the rest is dropped by the door
        barrel = barrelAt(dim, f, site.y, slot++);
      }
      const rest = barrel?.addItem(item);
      if (rest) dim.spawnItem(rest, { x: out.x + 0.5, y: outY, z: out.z + 0.5 });
    }
    for (const p of dim.getPlayers({ location: { x: out.x, y: outY, z: out.z }, maxDistance: 32 })) {
      p.sendMessage(raw(t("bannerforge.build.salvaged", String(salvaged.length))));
    }
  }
}

function barrelAt(dim: Dimension, f: Footprint, groundY: number, lx: number) {
  const p = toWorld(f, lx, f.w - 1);
  set(dim, p.x, groundY + 1, p.z, "minecraft:barrel");
  return dim.getBlock({ x: p.x, y: groundY + 1, z: p.z })?.getComponent("minecraft:inventory")?.container;
}

function* placePhase(dim: Dimension, site: Site, bp: Blueprint, phase: number): Generator<void, void, void> {
  const f = footprintOf(site);
  const [from, to] = phaseLayers(phase, bp.height);
  let n = 0;
  const signs: { x: number; y: number; z: number }[] = [];
  for (let ly = from; ly < to; ly++) {
    for (let lx = 0; lx < f.w; lx++) {
      for (let lz = 0; lz < f.w; lz++) {
        const spec = bp.at(lx, ly, lz);
        if (!spec) continue;
        const p = toWorld(f, lx, lz);
        set(dim, p.x, site.y + ly, p.z, spec.id, spec.states);
        if (spec.sign) signs.push({ x: p.x, y: site.y + ly, z: p.z });
        if (++n % BLOCKS_PER_YIELD === 0) yield;
      }
    }
  }
  for (const at of signs) labelSign(dim, at);
}

/** The building's name on its sign. Signs need a little time to exist, so this runs a tick later. */
function labelSign(dim: Dimension, at: { x: number; y: number; z: number }): void {
  const a = active.find((x) => x.dim === dim.id && at.x >= x.box.x0 && at.x <= x.box.x1 && at.z >= x.box.z0 && at.z <= x.box.z1);
  if (!a) return;
  const level = a.site.build?.to ?? a.site.built;
  const text: RawMessage = raw(buildingName(a.defId), txt("\n"), levelName(level));
  system.run(() => {
    try {
      dim.getBlock(at)?.getComponent("minecraft:sign")?.setText(text);
    } catch {
      // a sign without text is fine
    }
  });
}

function* removeScaffolding(dim: Dimension, site: Site, bp: Blueprint): Generator<void, void, void> {
  const f = footprintOf(site);
  for (const [lx, lz] of [[0, 0], [f.w - 1, 0], [0, f.w - 1], [f.w - 1, f.w - 1]]) {
    const p = toWorld(f, lx, lz);
    for (let ly = bp.height + 4; ly >= 1; ly--) {
      const block = dim.getBlock({ x: p.x, y: site.y + ly, z: p.z });
      if (block?.typeId === "minecraft:scaffolding") block.setType("minecraft:air");
    }
    yield;
  }
}

// ---------- protection ----------

function warn(player: Player): void {
  system.run(() => player.onScreenDisplay.setActionBar(raw(t("bannerforge.build.protected"))));
}

function registerProtection(): void {
  world.beforeEvents.playerBreakBlock.subscribe((e) => {
    const { x, y, z } = e.block.location;
    if (!siteAt(e.block.dimension.id, x, y, z)) return;
    e.cancel = true;
    warn(e.player);
  });

  world.beforeEvents.explosion.subscribe((e) => {
    if (!active.length) return;
    const blocks = e.getImpactedBlocks();
    const keep = blocks.filter((b) => !siteAt(b.dimension.id, b.location.x, b.location.y, b.location.z));
    if (keep.length !== blocks.length) e.setImpactedBlocks(keep);
  });

  // The stable API (2.11) has no "before place" event, so a block placed on a site is removed right away
  // and given back.
  world.afterEvents.playerPlaceBlock.subscribe((e) => {
    const { x, y, z } = e.block.location;
    if (!siteAt(e.block.dimension.id, x, y, z)) return;
    const item = e.block.getItemStack(1);
    e.block.setType("minecraft:air");
    if (item && e.player.getGameMode() !== GameMode.Creative) {
      e.player.getComponent("minecraft:inventory")?.container?.addItem(item);
    }
    warn(e.player);
  });
}

// ---------- developer commands ----------

/**
 * /scriptevent bannerforge:build_finish   finishes every construction within 64 blocks
 * /scriptevent bannerforge:build_next     moves them on by one phase
 */
function registerDevCommands(): void {
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "bannerforge:info") {
      if (e.sourceEntity?.typeId === "minecraft:player") settlementInfo(e.sourceEntity as Player);
      return;
    }
    if (e.id === "bannerforge:preview") {
      if (e.sourceEntity?.typeId === "minecraft:player") previewBlueprint(e.sourceEntity as Player, e.message.trim());
      return;
    }
    if (e.id !== "bannerforge:build_finish" && e.id !== "bannerforge:build_next") return;
    const player = e.sourceEntity;
    if (!player) return;
    const shift = e.id === "bannerforge:build_finish" ? BUILD_TICKS : BUILD_TICKS / PHASES;
    const touched = new Set<string>();
    for (const a of active) {
      if (a.dim !== player.dimension.id) continue;
      const d = Math.hypot(a.site.x + a.site.w / 2 - player.location.x, a.site.z + a.site.w / 2 - player.location.z);
      if (d > 64) continue;
      const s = settlementById(a.sid);
      const site = s?.sites?.[a.defId]?.[a.index];
      if (!s || !site?.build) continue;
      site.build.start -= shift;
      saveSettlement(s);
      touched.add(a.defId);
    }
    refreshActiveSites();
    if (player.typeId === "minecraft:player") (player as Player).sendMessage(`[BannerForge] ${e.id}: ${touched.size} site(s)`);
  });
}

/**
 * /scriptevent bannerforge:preview blue/house/a/2
 * Places a designed blueprint instantly in front of you, entrance facing you, on the ground you stand on
 * (step 5 of docs/STRUCTURES.md). No cost, no construction, no foundation: for looking only.
 * Without a key it lists the available blueprints.
 */
function previewBlueprint(player: Player, k: string): void {
  if (!k) {
    player.sendMessage(`[BannerForge] blueprints: ${blueprintKeys().join(", ") || "none"}`);
    return;
  }
  const probe = blueprintByKey(k, 0);
  if (!probe) {
    player.sendMessage(`[BannerForge] unknown blueprint "${k}". Try: ${blueprintKeys().join(", ")}`);
    return;
  }
  const v = player.getViewDirection();
  const f = footprintInFront(player.location.x, player.location.z, v.x, v.z, probe.w, 0);
  const bp = blueprintByKey(k, f.rot)!;
  const groundY = Math.floor(player.location.y) - 1;
  const dim = player.dimension;
  system.runJob(
    (function* () {
      try {
        for (let y = groundY + 1; y <= groundY + bp.height + 1; y++) {
          dim.fillBlocks(new BlockVolume({ x: f.x, y, z: f.z }, { x: f.x + f.w - 1, y, z: f.z + f.w - 1 }), "minecraft:air");
          yield;
        }
        let n = 0;
        for (let ly = 0; ly < bp.height; ly++) {
          for (let lx = 0; lx < f.w; lx++) {
            for (let lz = 0; lz < f.w; lz++) {
              const spec = bp.at(lx, ly, lz);
              if (!spec) continue;
              const p = toWorld(f, lx, lz);
              set(dim, p.x, groundY + ly, p.z, spec.id, spec.states);
              if (++n % BLOCKS_PER_YIELD === 0) yield;
            }
          }
        }
        player.sendMessage(`[BannerForge] placed ${k} (${n} blocks). Skipped blocks, if any, are in the content log.`);
      } catch (err) {
        player.sendMessage(`[BannerForge] preview failed: ${String(err)}`);
      }
    })(),
  );
}

/** /scriptevent bannerforge:info  shows the saved data of the nearest settlement (developer tool). */
function settlementInfo(player: Player): void {
  let best: Settlement | undefined;
  let bestD = Infinity;
  for (const s of allSettlements()) {
    if (s.dimension !== player.dimension.id) continue;
    const d = Math.hypot(s.center.x - player.location.x, s.center.z - player.location.z);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  if (!best) {
    player.sendMessage("[BannerForge] no settlement in this dimension");
    return;
  }
  const sites = Object.entries(best.sites ?? {})
    .map(([id, list]) => `${id}: ${list.map((x) => (x ? `${x.variant ?? "placeholder"} L${x.built}${x.build ? " building" : ""}` : "unplaced")).join(", ")}`)
    .join("; ");
  player.sendMessage(`[BannerForge] ${best.name}: faction=${best.faction}, schema=${best.schema}, ${Math.round(bestD)} blocks away. Sites: ${sites || "none"}`);
}
