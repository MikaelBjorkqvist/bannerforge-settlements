// Townsfolk in the world (owner 2026-11-18): the roster's people as citizen entities.
// - New people walk in: they appear at a safe spot on the border (daytime, loaded, solid ground, no monsters near)
//   and walk to town with vanilla's "move to village" goal. No fallback: if no spot is safe they come later; if they
//   die on the way, they die.
// - Hiring, losing a job and leaving change or remove their entity; deaths take them out of the numbers.
// - Town messages tell the players in the settlement what happened.
// Performance: one pass every 5 seconds; at most one walk-in per settlement per pass.

import { type Entity, type RawMessage, system, type Vector3, world } from "@minecraft/server";
import { CITIZEN_ID } from "./citizen_npc.js";
import { gameTime } from "./clock.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { jobBuilding, reconcile, removeDead, rosterOf, type Change } from "./roster.js";
import { tier } from "./rules.js";
import { SOLDIER_ID } from "./soldier.js";
import { buildingName, raw, t, txt } from "./text.js";
import { OUTFIT_INDEX, type Person, type Settlement } from "./types.js";

const INTERVAL = 100;
const DAWN = 1000;
const DUSK = 12000;
/**
 * A walker has arrived once inside the inner half of the border: vanilla's "move to village" goal brings them to the
 * village, not to the bell (play-test 2026-11-18: they stopped 35-40 blocks out). After WALK_TICKS inside the border
 * they count as arrived too.
 */
const WALK_TICKS = 1800;
const SAFE_RADIUS = 24;
/** Newcomers never appear closer to the bell than this (they should be seen walking in). */
const MIN_WALK = 28;

export const ofTag = (s: Settlement) => `bannerforge:of:${s.id}`;
const OF_PREFIX = "bannerforge:of:";
const POST_PREFIX = "bannerforge:post:";

export function registerPeople(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        tickPeople(s);
      } catch (err) {
        console.warn(`[BannerForge] people ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);

  world.afterEvents.entityDie.subscribe(
    (ev) => {
      const e = ev.deadEntity;
      const killer = ev.damageSource.damagingEntity;
      try {
        if (e.typeId === CITIZEN_ID) citizenDied(e, killer?.typeId);
        else soldierFell(e);
      } catch (err) {
        console.warn(`[BannerForge] death: ${String(err)}`);
      }
    },
    { entityTypes: [CITIZEN_ID, SOLDIER_ID] },
  );

  // A citizen killed by a zombie can come back as a vanilla zombie villager (name kept) instead of dying.
  world.afterEvents.entitySpawn.subscribe((ev) => {
    const z = ev.entity;
    if (z.typeId !== "minecraft:zombie_villager_v2" || !z.nameTag) return;
    for (const s of allSettlements()) {
      const p = rosterOf(s).find((q) => q.eid && q.name === z.nameTag && !world.getEntity(q.eid));
      if (!p) continue;
      removeDead(s, p);
      saveSettlement(s);
      news(s, raw(txt("§c"), t("bannerforge.people.zombified", p.name)));
      return;
    }
  });
}

/** After the rules ran (citizens.ts): bring the roster in line and act on what changed. Returns true if it did. */
export function syncPeople(s: Settlement): boolean {
  const changes = reconcile(s);
  for (const c of changes) apply(s, c);
  return changes.length > 0;
}

function apply(s: Settlement, c: Change): void {
  const e = c.person.eid ? world.getEntity(c.person.eid) : undefined;
  switch (c.kind) {
    case "hired":
      e?.triggerEvent("bannerforge:become_worker");
      if (c.person.state === "here") news(s, raw(txt("§7"), t("bannerforge.people.hired", c.person.name), txt(" "), buildingName(jobBuilding(c.job))));
      break;
    case "fired":
      e?.triggerEvent("bannerforge:become_settler");
      news(s, raw(txt("§6"), t("bannerforge.people.fired", c.person.name), txt(" "), buildingName(jobBuilding(c.job))));
      break;
    case "left":
      e?.remove();
      if (c.person.state !== "coming") news(s, raw(txt("§6"), t("bannerforge.people.left", c.person.name, s.name)));
      break;
    case "coming":
      break;
  }
}

/** Walk-ins, arrivals and leftovers, every few seconds. */
function tickPeople(s: Settlement): void {
  const people = rosterOf(s);
  let changed = false;

  // Arrivals: walkers that reached the bell settle in.
  for (const p of people) {
    if (p.state !== "walking" || !p.eid) continue;
    const e = world.getEntity(p.eid);
    if (!e) continue;
    const d = Math.max(Math.abs(e.location.x - s.center.x), Math.abs(e.location.z - s.center.z));
    const border = BORDER_RADIUS[tier(s)];
    if (d <= border / 2 || (d <= border && gameTime() - (p.since ?? 0) >= WALK_TICKS)) {
      e.triggerEvent("bannerforge:arrived");
      if (p.job && e.getProperty("bannerforge_settlements:role") !== "worker") e.triggerEvent("bannerforge:become_worker");
      p.state = "here";
      changed = true;
      news(s, raw(txt("§a"), t("bannerforge.people.arrived", p.name, s.name)));
      if (p.job) news(s, raw(txt("§7"), t("bannerforge.people.hired", p.name), txt(" "), buildingName(jobBuilding(p.job))));
    }
  }

  // One newcomer per pass sets off from the border, by day.
  const tod = gameTime() % 24000;
  const next = people.find((p) => p.state === "coming");
  if (next && tod >= DAWN && tod < DUSK) {
    const spot = safeBorderSpot(s);
    if (spot) {
      spawnWalker(s, next, spot);
      changed = true;
    }
  }

  // Citizens of this settlement nobody knows any more (they left while their chunk was unloaded) go for good.
  const known = new Set(people.map((p) => p.eid).filter(Boolean));
  const r = BORDER_RADIUS[tier(s)] + 32;
  for (const e of world.getDimension(s.dimension).getEntities({ type: CITIZEN_ID, tags: [ofTag(s)], location: s.center, maxDistance: r })) {
    if (!known.has(e.id)) e.remove();
  }
  if (changed) saveSettlement(s);
}

function spawnWalker(s: Settlement, p: Person, at: Vector3): void {
  const dim = world.getDimension(s.dimension);
  const spawnEvent = p.job ? "bannerforge:spawn_arriving_worker" : "bannerforge:spawn_arriving";
  const e = dim.spawnEntity(CITIZEN_ID, at, { spawnEvent });
  try {
    e.setProperty("bannerforge_settlements:outfit", OUTFIT_INDEX[s.faction as keyof typeof OUTFIT_INDEX] ?? 0);
  } catch {
    // look property is optional
  }
  e.nameTag = p.name;
  e.addTag(ofTag(s));
  p.eid = e.id;
  p.state = "walking";
  p.since = gameTime();
}

/**
 * A safe place to walk in from: on a line from the border towards the bell, the first spot that is loaded and
 * simulated (the border itself is often beyond a player's simulation distance), with dry solid ground, room to stand
 * and no monster within SAFE_RADIUS. A few random lines; undefined if none is safe right now (try next pass).
 */
export function safeBorderSpot(s: Settlement): Vector3 | undefined {
  const r = BORDER_RADIUS[tier(s)] - 3;
  for (let i = 0; i < 4; i++) {
    const along = Math.random() * 2 - 1;
    const side = Math.floor(Math.random() * 4);
    const ux = side === 0 ? 1 : side === 1 ? -1 : along;
    const uz = side === 2 ? 1 : side === 3 ? -1 : along;
    for (let d = r; d >= MIN_WALK; d -= 8) {
      const spot = safeAt(s, Math.floor(s.center.x + ux * d), Math.floor(s.center.z + uz * d));
      if (spot === "unloaded") continue;
      if (spot) return spot;
      break; // loaded but unsafe: try another line
    }
  }
  return undefined;
}

function safeAt(s: Settlement, x: number, z: number): Vector3 | undefined | "unloaded" {
  const dim = world.getDimension(s.dimension);
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top) return "unloaded";
    if (top.isLiquid || /leaves|log|lava|water|ice|cactus|magma|fire/.test(top.typeId)) return undefined;
    const feet = dim.getBlock({ x, y: top.location.y + 1, z });
    const head = dim.getBlock({ x, y: top.location.y + 2, z });
    if (!feet?.isAir || !head?.isAir) return undefined;
    const at = { x: x + 0.5, y: top.location.y + 1, z: z + 0.5 };
    if (dim.getEntities({ location: at, maxDistance: SAFE_RADIUS, families: ["monster"] }).length) return undefined;
    return at;
  } catch {
    return "unloaded"; // not loaded or not simulated
  }
}

function citizenDied(e: Entity, killer: string | undefined): void {
  const s = settlementOf(e, OF_PREFIX);
  if (!s) return;
  const p = rosterOf(s).find((q) => q.eid === e.id);
  if (!p) return;
  removeDead(s, p);
  saveSettlement(s);
  news(s, killer ? raw(txt("§c"), t("bannerforge.people.killed", p.name), txt(" "), killerName(killer)) : raw(txt("§c"), t("bannerforge.people.died", p.name)));
}

function soldierFell(e: Entity): void {
  const s = settlementOf(e, POST_PREFIX);
  if (s) news(s, raw(txt("§c"), t("bannerforge.people.fell", e.nameTag)));
}

const killerName = (typeId: string): RawMessage =>
  typeId === "minecraft:player" ? t("bannerforge.people.a_player") : { translate: `entity.${typeId.replace("minecraft:", "")}.name` };

function settlementOf(e: Entity, prefix: string): Settlement | undefined {
  const tag = e.getTags().find((x) => x.startsWith(prefix));
  return tag ? settlementById(tag.slice(prefix.length).split(":")[0]) : undefined;
}

/** Tells the players in (or just around) the settlement. */
export function news(s: Settlement, msg: RawMessage): void {
  const r = BORDER_RADIUS[tier(s)] + 32;
  for (const pl of world.getDimension(s.dimension).getPlayers()) {
    if (Math.max(Math.abs(pl.location.x - s.center.x), Math.abs(pl.location.z - s.center.z)) <= r) pl.sendMessage(msg);
  }
}
