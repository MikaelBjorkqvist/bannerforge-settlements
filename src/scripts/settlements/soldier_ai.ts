// Soldier watchdog (owner 2026-11-19: good military AI, healing with visuals). The behaviour file does the fighting;
// this pass handles what it can't see:
//  - leash: past his duty's chase distance a soldier drops the fight and walks back to his post
//  - water: a soldier who ended up in water gives up and wades back
//  - stuck or unreachable: away from his post, not moving and not fighting for 10 s -> back to his post; the monsters
//    around him are ignored by melee soldiers for 30 s (left to the archers). Still stuck after 30 s and no player
//    near -> he is put back at his post
//  - low health: below 30 % he goes back to his post and heals there until he is nearly whole
//  - healing: out of combat for 8 s he heals (regeneration, which shows its swirls) and hearts rise over his head;
//    faster at his post when he came back to heal, or at a barracks, tower or the Keep
//
// Performance (CLAUDE.md rule 6): every 2 seconds, one entity query per town and per player, constant work per soldier.

import { type Dimension, type Entity, system, type Vector3, world } from "@minecraft/server";
import { LEASH, WANDER } from "./duties.js";
import { P_ROLE, postAt } from "./garrison.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements, settlementNear } from "./registry.js";
import { isUnderAttack } from "./raid.js";
import { tier } from "./rules.js";
import { SOLDIER_ID } from "./soldier.js";
import type { Role } from "./types.js";

const INTERVAL = 40;
const NEAR_PLAYER = 80;
/** Ticks since the last blow given or taken that still count as fighting. */
const FIGHT_TICKS = 120;
const HEAL_AFTER = 160;
const STUCK_TICKS = 200;
const RESCUE_TICKS = 600;
const IGNORE_TICKS = 600;
const LOW = 0.3;
const HEALED = 0.9;

/** Why a soldier is on his way back (stored on him so it survives a reload). */
const P_RETREAT = "bannerforge:retreat";
type Reason = "heal" | "water" | "leash" | "stuck";

const IGNORED = "bannerforge:ignored";
const lastFight = new Map<string, number>();
const lastPos = new Map<string, { at: Vector3; since: number }>();
const ignored = new Map<string, { e: Entity; until: number }>();

export function registerSoldierAi(): void {
  world.afterEvents.entityHurt.subscribe((ev) => {
    const now = system.currentTick;
    if (ev.hurtEntity.typeId === SOLDIER_ID) lastFight.set(ev.hurtEntity.id, now);
    const by = ev.damageSource.damagingEntity;
    if (by?.typeId === SOLDIER_ID) lastFight.set(by.id, now);
  });
  world.afterEvents.entityDie.subscribe(
    (ev) => {
      lastFight.delete(ev.deadEntity.id);
      lastPos.delete(ev.deadEntity.id);
    },
    { entityTypes: [SOLDIER_ID] },
  );
  system.runInterval(pass, INTERVAL);
}

function pass(): void {
  const now = system.currentTick;
  const seen = new Set<string>();
  // Every town's soldiers (they heal and keep their leash wherever they are loaded), plus any near a player.
  const areas: { dim: Dimension; at: Vector3; r: number }[] = allSettlements().map((s) => ({
    dim: world.getDimension(s.dimension),
    at: s.center,
    r: BORDER_RADIUS[tier(s)] + 40,
  }));
  for (const p of world.getAllPlayers()) areas.push({ dim: p.dimension, at: p.location, r: NEAR_PLAYER });
  for (const a of areas) {
    for (const e of a.dim.getEntities({ type: SOLDIER_ID, location: a.at, maxDistance: a.r })) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      try {
        think(e, now);
      } catch (err) {
        console.warn(`[BannerForge] soldier ai: ${String(err)}`);
      }
    }
  }
  for (const [id, x] of ignored) {
    if (now < x.until) continue;
    ignored.delete(id);
    if (x.e.isValid) x.e.removeTag(IGNORED);
  }
}

function think(e: Entity, now: number): void {
  const role = e.getDynamicProperty(P_ROLE) as Role | undefined;
  const post = postAt(e);
  const hp = e.getComponent("minecraft:health");
  const ratio = hp ? hp.currentValue / hp.effectiveMax : 1;
  const fighting = now - (lastFight.get(e.id) ?? -1e9) < FIGHT_TICKS;
  const loc = e.location;

  // Has he moved since last time?
  const last = lastPos.get(e.id);
  if (!last || dist(last.at, loc) > 1) lastPos.set(e.id, { at: { ...loc }, since: now });
  const stillFor = now - (lastPos.get(e.id)?.since ?? now);

  const retreat = e.getDynamicProperty(P_RETREAT) as Reason | undefined;
  const away = post ? dist(post, loc) : 0;

  if (role && post) {
    if (!retreat) {
      if (ratio < LOW) start(e, "heal");
      else if (e.isInWater) start(e, "water");
      else if (overLeash(e, role, post, loc)) start(e, "leash");
      else if (!fighting && role !== "patrol" && away > WANDER[role] + 3 && stillFor >= STUCK_TICKS) {
        ignoreAround(e, now);
        start(e, "stuck");
      }
    } else if (away < 3) {
      if (retreat !== "heal" || ratio >= HEALED) stop(e);
    } else if (stillFor >= RESCUE_TICKS && !playerWithin(e, 24)) {
      e.teleport(post);
      lastPos.delete(e.id);
      if (retreat !== "heal") stop(e);
    }
  }

  // Healing, with something to see: regeneration swirls and a heart over his head.
  if (hp && ratio < 1 && now - (lastFight.get(e.id) ?? -1e9) >= HEAL_AFTER) {
    const atPost = post !== undefined && away < 6;
    const fast = atPost && (retreat === "heal" || role === "barracks" || role === "tower" || role === "bell" || role === "captain");
    e.addEffect("regeneration", INTERVAL + 20, { amplifier: fast ? 1 : 0, showParticles: true });
    try {
      e.dimension.spawnParticle("minecraft:heart_particle", { x: loc.x, y: loc.y + 2.3, z: loc.z });
    } catch {
      // particle not available: the swirls still show
    }
  }
}

/** Past the chase distance for his duty? The town patrol is measured from the bell: up to the border + 8. */
function overLeash(e: Entity, role: Role, post: Vector3, loc: Vector3): boolean {
  // During a raid every soldier may fight anywhere in town (up to the border + 8, like the patrol).
  const raid = role !== "patrol" && allSettlements().some((x) => isUnderAttack(x.id) && dist(x.center, loc) < 200);
  if (role === "patrol" || raid) {
    const s = settlementNear(e.dimension.id, loc, 200);
    if (!s) return false;
    const r = BORDER_RADIUS[tier(s)] + LEASH.patrol;
    return Math.abs(loc.x - s.center.x) > r || Math.abs(loc.z - s.center.z) > r;
  }
  return dist(post, loc) > LEASH[role];
}

function start(e: Entity, reason: Reason): void {
  e.setDynamicProperty(P_RETREAT, reason);
  e.triggerEvent("bannerforge:retreat");
}

function stop(e: Entity): void {
  e.setDynamicProperty(P_RETREAT, undefined);
  e.triggerEvent("bannerforge:resume");
}

/** Monsters around a soldier who couldn't reach them: melee soldiers leave them alone for a while. */
function ignoreAround(e: Entity, now: number): void {
  for (const m of e.dimension.getEntities({ families: ["monster"], location: e.location, maxDistance: 10 })) {
    m.addTag(IGNORED);
    ignored.set(m.id, { e: m, until: now + IGNORE_TICKS });
  }
}

function playerWithin(e: Entity, r: number): boolean {
  return e.dimension.getPlayers({ location: e.location, maxDistance: r }).length > 0;
}

const dist = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);

