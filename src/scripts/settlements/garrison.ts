// Garrisons in the world (owner 2026-11-18): soldiers come with a finished military building and stand at its door;
// a fallen soldier is replaced at the next dawn; the Captain trains their rank, up to what the tier allows. Soldiers belong to a post through a tag
// (bannerforge:post:<settlement>:<building>:<instance>), so the world itself is the record of who is alive.
//
// Performance (CLAUDE.md rule 6): one pass every 5 seconds, a few tag queries per settlement, and only posts whose
// chunk is loaded are touched (a soldier in an unloaded chunk can't be seen, so nothing is refilled there).

import { type Dimension, type Entity, system, type Vector3, world } from "@minecraft/server";
import { BORDER_RADIUS, toWorld } from "./plots.js";
import { gameTime } from "./clock.js";
import { allSettlements, saveSettlement } from "./registry.js";
import { garrisonRank, posts, tier, type Post } from "./rules.js";
import { news } from "./people.js";
import { CAPTAIN_TITLE, SOLDIER_ID, type SoldierKind, spawnSoldier, soldierTitle } from "./soldier.js";
import { placeIndex, setRank, slotKey, slotRank, slots, type Slot } from "./duties.js";
import { updateGates } from "./gates.js";
import { walkFrom } from "./walk.js";
import { buildingName, raw, t, txt } from "./text.js";
import type { Role, Settlement, Site } from "./types.js";

const INTERVAL = 100;
/** Same morning window as the settlers (citizens.ts): from 7:00 to dusk. */
const DAWN = 1000;
const RANK_PROP = "bannerforge_settlements:rank";

export const postTag = (s: Settlement, p: Pick<Post, "id" | "index">) => `bannerforge:post:${s.id}:${p.id}:${p.index}`;
const settlementPrefix = (s: Settlement) => `bannerforge:post:${s.id}:`;

export function registerGarrisons(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        maintain(s);
      } catch (err) {
        console.warn(`[BannerForge] garrison ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);
}

/** Sends new garrisons, refills at dawn, keeps trained ranks and gear and dismisses soldiers of lost posts. */
export function maintain(s: Settlement, forceDawn = false): void {
  const dim = world.getDimension(s.dimension);
  const now = gameTime();
  // The town keeps going while nobody is there (owner 2026-11-19): a refill is due as soon as a dawn has passed since
  // the last one, at any hour, so the fallen are back whenever the player returns.
  const day = Math.floor((now - DAWN) / 24000);
  const dawn = forceDawn || (s.garrisonDay ?? -1) < day;
  // The town's tier caps the rank; the Captain trains each slot up to it (duties.ts slotRank).
  const maxRank = garrisonRank(s);
  let changed = false;
  if (posts(s).some((p) => p.kind === "melee")) updateGates(s);
  const all = slots(s, (p) => postTag(s, p));

  const live = new Set<string>();
  let fixes = 0;
  // A post whose chunk isn't loaded waits: the day's refill stays open until every post was seen (play-test
  // 2026-11-19: dead archers never came back because dawn passed while their tower was unloaded).
  let skipped = false;
  for (const post of posts(s)) {
    const tag = postTag(s, post);
    live.add(tag);
    const door = doorOf(dim, post);
    if (!door) {
      skipped = true; // chunk not loaded
      continue;
    }
    const soldiers = dim.getEntities({ type: SOLDIER_ID, tags: [tag] });
    for (const e of soldiers) {
      const key = slotKey(tag, Number(e.getDynamicProperty(P_DUTY) ?? -1));
      // Soldiers from before training keep the rank they had.
      if (s.ranks?.[key] === undefined && Number(e.getProperty(RANK_PROP)) > 1) {
        setRank(s, key, Math.min(Number(e.getProperty(RANK_PROP)), maxRank) as 1 | 2 | 3);
        changed = true;
      }
      syncRank(e, post, slotRank(s, key, maxRank));
      // 2026-11-19: drinking potions took soldiers' weapons; re-issue their rank's gear once.
      if (e.getDynamicProperty(P_GEAR) !== GEAR_VERSION) {
        const r = Number(e.getProperty(RANK_PROP)) || 1;
        e.triggerEvent(`bannerforge:rank_${r}`);
        equipGear(e);
        e.setDynamicProperty(P_GEAR, GEAR_VERSION);
      }
      // A soldier whose duty changed (duty board, new gates) or who predates duties walks to his new spot.
      // Also when his spot moved: another soldier's duty change shifts who stands at which gate or border side.
      const slot = all.find((x) => x.key === slotKey(tag, Number(e.getDynamicProperty(P_DUTY) ?? -1)));
      if (!slot || fixes >= 2 || e.getProperty("bannerforge_settlements:falling_back")) continue;
      const at = placeOf(dim, s, all, slot, door);
      const home = postAt(e);
      const moved = at !== door && home !== undefined && Math.hypot(at.x - home.x, at.z - home.z) > 6;
      if (dutyOf(e) !== slot.role || moved) {
        fixes++;
        reassign(e, at, slot.role);
      }
    }
    if (!post.site.manned || dawn) {
      // Who is missing: each soldier of a post has a duty (its index), so a refill takes the fallen one's place.
      const held = new Set(soldiers.map((e) => Number(e.getDynamicProperty(P_DUTY) ?? -1)));
      for (let n = 0, missing = post.count - soldiers.length; n < post.count && missing > 0; n++) {
        if (held.has(n)) continue;
        missing--;
        const slot = all.find((x) => x.key === slotKey(tag, n)) ?? { key: slotKey(tag, n), post, n, role: "barracks" as Role };
        const at = placeOf(dim, s, all, slot, door);
        const rank = slotRank(s, slot.key, maxRank);
        const e = spawnSoldier(dim, at, post.kind, s.faction, `${tag}:${now}:${n}`, rank);
        equipGear(e);
        e.addTag(tag);
        e.setDynamicProperty(P_DUTY, n);
        setRole(e, slot.role, at);
        if (post.site.manned) news(s, raw(txt("§7"), t("bannerforge.people.replaced", soldierTitle(post.kind, rank)), txt(" "), buildingName(post.id)));
      }
      if (!post.site.manned) {
        post.site.manned = true;
        changed = true;
      }
    }
  }
  if (keepCaptain(dim, s, dawn)) changed = true;
  if (dawn && !skipped && s.garrisonDay !== day) {
    // Each soldier carries two healing potions; the barracks restocks them every morning (soldier.json potions).
    const r = BORDER_RADIUS[tier(s)] + 40;
    for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: r })) e.triggerEvent("bannerforge:restock");
    s.garrisonDay = day;
    changed = true;
  }

  // Soldiers whose building is gone go home for good.
  const r = BORDER_RADIUS[tier(s)] + 32;
  for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: r })) {
    const tag = e.getTags().find((t) => t.startsWith(settlementPrefix(s)));
    if (tag && !live.has(tag)) e.remove();
  }
  if (changed) saveSettlement(s);
}

export const P_DUTY = "bannerforge:duty";
const P_GEAR = "bannerforge:gear";
const GEAR_VERSION = 4;
/** Longest walk to a new duty: within the soldier's follow range (32, soldier.json). */
const SOLDIER_WALK = 28;
/** The spot a soldier serves at (his home: where he was spawned), as "x,y,z". His duty is an entity property. */
export const P_POST_AT = "bannerforge:post_at";
export const captainTag = (s: Settlement) => `bannerforge:captain:${s.id}`;

/** The soldier's duty, kept by the behaviour file ("none" before he got one). */
/**
 * Gear the rank's loot table can't place: every melee fighter carries a shield in the off hand (the behaviour file
 * blocks with it). Run after spawning and after every rank change.
 */
export function equipGear(e: Entity): void {
  // Owner 2026-11-19: every melee fighter carries a shield (militia too).
  const shield = e.getProperty("bannerforge_settlements:kind") === "melee";
  try {
    e.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${shield ? "shield" : "air"}`);
  } catch (err) {
    console.warn(`[BannerForge] soldier gear: ${String(err)}`);
  }
}

export const dutyOf = (e: Entity): string => String(e.getProperty("bannerforge_settlements:duty") ?? "none");

/** Gives a soldier his duty's behaviour and remembers his spot. */
function setRole(e: Entity, role: Role, at: Vector3): void {
  e.setDynamicProperty(P_POST_AT, `${Math.floor(at.x)},${Math.floor(at.y)},${Math.floor(at.z)}`);
  // The behaviour file does the rest (soldier.json duty_<role>): his home area is how far he may chase.
  e.triggerEvent(`bannerforge:duty_${role}`);
}

/** Where a soldier post's spot is (his home radius comes from the duty). */
export function postAt(e: Entity): Vector3 | undefined {
  const v = e.getDynamicProperty(P_POST_AT);
  if (typeof v !== "string") return undefined;
  const [x, y, z] = v.split(",").map(Number);
  return { x: x + 0.5, y, z: z + 0.5 };
}

/**
 * Moves a soldier to a new duty. His home is where he was spawned, so a new soldier with the same name, rank, health
 * and tags is spawned at the new spot and teleported to where the old one stood in the same tick: he walks over.
 */
export function reassign(old: Entity, at: Vector3, role: Role): Entity {
  const dim = old.dimension;
  const from = old.location;
  const kind = (old.getProperty("bannerforge_settlements:kind") as SoldierKind) ?? "melee";
  const rank = (Number(old.getProperty(RANK_PROP)) || 1) as 1 | 2 | 3;
  const e = dim.spawnEntity(SOLDIER_ID, at, { spawnEvent: `bannerforge:spawn_${kind}` });
  if (rank > 1) e.triggerEvent(`bannerforge:rank_${rank}`);
  try {
    e.setProperty("bannerforge_settlements:outfit", Number(old.getProperty("bannerforge_settlements:outfit")) || 0);
  } catch {
    // no outfit property
  }
  e.nameTag = old.nameTag;
  for (const tag of old.getTags()) e.addTag(tag);
  e.setDynamicProperty(P_DUTY, old.getDynamicProperty(P_DUTY));
  setRole(e, role, at);
  equipGear(e);
  const hpOld = old.getComponent("minecraft:health");
  const hpNew = e.getComponent("minecraft:health");
  if (hpOld && hpNew) hpNew.setCurrentValue(Math.max(1, Math.min(hpOld.currentValue, hpNew.effectiveMax)));
  walkFrom(e, from, at, SOLDIER_WALK);
  old.remove();
  return e;
}

/** The spot for a slot's duty. Falls back to the post's door while a spot isn't loaded. */
function placeOf(dim: Dimension, s: Settlement, all: Slot[], slot: Slot, door: Vector3): Vector3 {
  const i = placeIndex(all, slot.key);
  switch (slot.role) {
    case "tower":
      return towerTop(dim, slot.post.site) ?? door;
    case "patrol":
      // The town patrol's home is the bell: he roams the whole town from there (soldier.json duty_patrol).
      return standOn(dim, s.center.x - 2, s.center.z + 2) ?? door;
    case "bell":
      return standOn(dim, s.center.x + 2, s.center.z) ?? door;
    case "gate": {
      const g = s.gates?.[i % (s.gates?.length || 1)];
      if (!g) return door;
      // A few blocks inside the entrance, towards the bell.
      const dx = Math.sign(s.center.x - g.x) * (Math.abs(s.center.x - g.x) > Math.abs(s.center.z - g.z) ? 3 : 0);
      const dz = Math.sign(s.center.z - g.z) * (Math.abs(s.center.z - g.z) >= Math.abs(s.center.x - g.x) ? 3 : 0);
      return standOn(dim, g.x + dx, g.z + dz) ?? door;
    }
    case "border": {
      // Four sides at 80 % of the border.
      const r = Math.floor(BORDER_RADIUS[tier(s)] * 0.8);
      const sides = [[0, -r], [r, 0], [0, r], [-r, 0]];
      const [dx, dz] = sides[i % 4];
      return standOn(dim, s.center.x + dx, s.center.z + dz) ?? door;
    }
    default:
      return door; // barracks, patrol (starts at the door), keep door
  }
}

/**
 * The Captain (owner 2026-11-19): one per settlement with a barracks, roaming inside the first barracks. He keeps the
 * duty board. Sent with the barracks' first garrison and replaced at dawn like the others. Returns true when the
 * settlement record changed.
 */
function keepCaptain(dim: Dimension, s: Settlement, dawn: boolean): boolean {
  const barracks = posts(s).find((p) => p.id === "barracks");
  const tag = captainTag(s);
  const alive = dim.getEntities({ type: SOLDIER_ID, tags: [tag] });
  if (!barracks) {
    for (const e of alive) e.remove();
    return false;
  }
  if (alive.length) {
    for (const e of alive) if (e.getProperty("bannerforge_settlements:duty") === "none") e.triggerEvent("bannerforge:duty_captain");
    return false;
  }
  const first = !s.captainSent;
  if (!first && !dawn) return false;
  const at = floorInside(dim, barracks.site) ?? doorOf(dim, barracks);
  if (!at) return false;
  const e = spawnSoldier(dim, at, "melee", s.faction, `${tag}:${gameTime()}`, 3);
  e.nameTag = `${CAPTAIN_TITLE}, ${e.nameTag.split(", ")[1] ?? ""}`;
  e.addTag(tag);
  equipGear(e);
  setRole(e, "captain", at);
  if (first) {
    s.captainSent = true;
    return true;
  }
  return false;
}

/** A standing spot on the floor in the middle of a building (the Captain walks around inside his barracks). */
export function floorInside(dim: Dimension, site: Site): Vector3 | undefined {
  const w = site.w;
  const d = site.d ?? site.w;
  const mid = toWorld({ x: site.x, z: site.z, w, d, rot: site.rot }, Math.floor((w - 1) / 2), Math.floor((d - 1) / 2));
  try {
    for (let y = site.y + 1; y < site.y + 8; y++) {
      const ground = dim.getBlock({ x: mid.x, y: y - 1, z: mid.z });
      const feet = dim.getBlock({ x: mid.x, y, z: mid.z });
      const head = dim.getBlock({ x: mid.x, y: y + 1, z: mid.z });
      if (ground && feet && head && !ground.isAir && feet.isAir && head.isAir) return { x: mid.x + 0.5, y, z: mid.z + 0.5 };
    }
  } catch {
    // not loaded
  }
  return undefined;
}

/** The top of a tower: the highest spot with room to stand inside the site's middle (archers shoot from there). */
function towerTop(dim: Dimension, site: Site): Vector3 | undefined {
  const w = site.w;
  const d = site.d ?? site.w;
  const mid = toWorld({ x: site.x, z: site.z, w, d, rot: site.rot }, Math.floor((w - 1) / 2), Math.floor((d - 1) / 2));
  try {
    for (let y = site.y + 24; y > site.y + 2; y--) {
      const ground = dim.getBlock({ x: mid.x, y: y - 1, z: mid.z });
      const feet = dim.getBlock({ x: mid.x, y, z: mid.z });
      const head = dim.getBlock({ x: mid.x, y: y + 1, z: mid.z });
      if (ground && feet && head && !ground.isAir && !ground.isLiquid && feet.isAir && head.isAir) return { x: mid.x + 0.5, y, z: mid.z + 0.5 };
    }
  } catch {
    // not loaded
  }
  return undefined;
}

/**
 * Standing spot on dry ground at or near x, z: looks in rings up to 12 blocks out, so a watch post by a river or
 * lake still gets a soldier (play-test 2026-11-19: a post in water sent him back to the barracks door).
 * Undefined while not loaded or when all of it is water.
 */
function standOn(dim: Dimension, x: number, z: number): Vector3 | undefined {
  for (let r = 0; r <= 12; r += 3) {
    for (const [dx, dz] of r === 0 ? [[0, 0]] : [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      try {
        const top = dim.getTopmostBlock({ x: x + dx, z: z + dz });
        if (!top || top.isLiquid || top.typeId.includes("leaves")) continue;
        // Not inside a pen: soldiers can't open fence gates (play-test 2026-11-19).
        if (fenced(dim, top.location.x, top.location.y + 1, top.location.z)) continue;
        return { x: x + dx + 0.5, y: top.location.y + 1, z: z + dz + 0.5 };
      } catch {
        return undefined; // not loaded
      }
    }
  }
  return undefined;
}

/** Is there a fence, wall or gate within 4 blocks at standing height (an animal pen, a fenced yard)? */
function fenced(dim: Dimension, x: number, y: number, z: number): boolean {
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const id = dim.getBlock({ x: x + dx, y, z: z + dz })?.typeId ?? "";
      if (id.includes("fence") || id.endsWith("_wall")) return true;
    }
  }
  return false;
}

/** Rank, gear and title follow the slot's trained rank. */
function syncRank(e: Entity, post: Post, rank: 1 | 2 | 3): void {
  if (e.getProperty(RANK_PROP) === rank) return;
  if (dutyOf(e) === "captain") return;
  e.triggerEvent(`bannerforge:rank_${rank}`);
  equipGear(e);
  const name = e.nameTag.split(", ")[1];
  if (name) e.nameTag = `${soldierTitle(post.kind, rank)}, ${name}`;
}

/**
 * Where the garrison stands: just outside the middle of the entrance, on the first free spot from the plot's ground
 * up. Undefined while the chunk isn't loaded.
 */
function doorOf(dim: Dimension, post: Post): Vector3 | undefined {
  return doorOfSite(dim, post.site);
}

/** Just outside the middle of a site's entrance, on the first free spot from the ground up (also the Town Hall). */
export function doorOfSite(dim: Dimension, site: Site): Vector3 | undefined {
  const w = site.w;
  const d = site.d ?? site.w;
  const at = toWorld({ x: site.x, z: site.z, w, d, rot: site.rot }, Math.floor((w - 1) / 2), d);
  for (let y = site.y + 1; y <= site.y + 6; y++) {
    let feet, head;
    try {
      feet = dim.getBlock({ x: at.x, y, z: at.z });
      head = dim.getBlock({ x: at.x, y: y + 1, z: at.z });
    } catch {
      return undefined;
    }
    if (!feet || !head) return undefined;
    if (feet.isAir && head.isAir) return { x: at.x + 0.5, y, z: at.z + 0.5 };
  }
  return { x: at.x + 0.5, y: site.y + 1, z: at.z + 0.5 };
}
