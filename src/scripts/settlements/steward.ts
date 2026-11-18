import { gameTime } from "./clock.js";
import { type Block, type Dimension, type Entity, type Player, system, world } from "@minecraft/server";
import { showClaimForm } from "./founding.js";
import { openLedger } from "./ledger.js";
import { NPC_NAMES, pickIndex, pickName, respawnTicksLeft, ticksToMinutes } from "./npc.js";
import { allSettlements, saveSettlement, settlementById, settlementNear } from "./registry.js";
import { raw, say, t } from "./text.js";
import { BORDER } from "./plots.js";
import { safeWalkInSpot } from "./people.js";
import { OUTFIT_INDEX, type Settlement, type Vec3 } from "./types.js";

/**
 * The steward lives by the village bell (owner decisions 2026-11-12 and 2026-11-15):
 * - Ringing the bell only calls the steward. It never opens a menu.
 * - Unclaimed bell: a neutral steward appears; talking to them founds a settlement.
 * - Claimed bell: the settlement's steward comes back to the bell; talking to them opens the ledger.
 * - A steward can die. The ledger is closed until they return one in-game day later;
 *   ringing the bell meanwhile says how long that will take.
 * - Stewards walk in (owner, 2026-11-18): a new or returning steward appears at a safe spot a short walk away and
 *   walks to the bell (home = the bell, BP "bannerforge:arriving" group). If they die on the way, they die.
 *   Only if no spot is safe do they appear at the bell; a steward stuck for STUCK_TICKS comes when the bell rings.
 */

export const STEWARD_ID = "bannerforge_settlements:steward";
/**
 * Profession title in the name tag. Name tags are plain strings and cannot be translated,
 * so this is a documented exception to the lang rule (docs/DESIGN.md, NPC names).
 */
const TITLE = "Steward";
const BELL_ID = "minecraft:bell";
/** Every bell within a city-sized border belongs to the settlement (owner, 2026-11-15: fixes villages with two bells). */
const SETTLEMENT_RADIUS = BORDER;
/** New settlements need room to grow into a city without touching another settlement's city-sized border. */
const FOUNDING_DISTANCE = 2 * BORDER;
/** How far from the bell we look for the steward. Their home radius is 12 (BP/entities/steward.json). */
const SEARCH_RADIUS = 96;
/** Ignore repeat interactions from the same player within this many ticks (holding "use" fires repeatedly). */
const COOLDOWN_TICKS = 20;
/** How often to check whether a dead steward may return near a player. */
const RESPAWN_CHECK_TICKS = 200;
/** Walk-in distance from the bell (blocks): far enough to be seen walking, close enough to stay in loaded chunks. */
const WALK_FAR = 32;
const WALK_NEAR = 12;
/** A walking steward this long on the way is taken to be stuck: the next bell ring brings them over. */
const STUCK_TICKS = 1200;
const WALKING_TAG = "bannerforge:walking";

// Entity dynamic properties
const P_SETTLEMENT = "bannerforge:settlement"; // settlement id, once founded
const P_BELL = "bannerforge:bell"; // JSON position of the bell the steward belongs to
const P_NAME = "bannerforge:name"; // personal name
const P_SKIN = "bannerforge:skin"; // skin variant, kept for the layered art (not shown yet)
const P_SINCE = "bannerforge:since"; // game time the walk-in started

export const nameTagFor = (name: string) => `${TITLE}, ${name}`;

export function registerSteward(): void {
  const lastUse = new Map<string, number>();
  const cooledDown = (player: Player) => {
    const now = system.currentTick;
    if (now - (lastUse.get(player.id) ?? -COOLDOWN_TICKS) < COOLDOWN_TICKS) return false;
    lastUse.set(player.id, now);
    return true;
  };

  world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.block.typeId !== BELL_ID || !cooledDown(event.player)) return;
    onBellRung(event.player, event.block);
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    if (event.target.typeId !== STEWARD_ID) return;
    event.cancel = true;
    const { player, target } = event;
    if (!cooledDown(player)) return;
    system.run(() => onTalk(player, target));
  });

  world.afterEvents.entityDie.subscribe((event) => onStewardDied(event.deadEntity), { entityTypes: [STEWARD_ID] });

  world.afterEvents.dataDrivenEntityTrigger.subscribe((event) => onArrived(event.entity), {
    entityTypes: [STEWARD_ID],
    eventTypes: ["bannerforge:arrived"],
  });

  system.runInterval(returnStewardsNearPlayers, RESPAWN_CHECK_TICKS);
}

// ---- bell ----------------------------------------------------------------

export function onBellRung(player: Player, block: Block): void {
  const { x, y, z } = block.location;
  const bell = { x, y, z };
  const s = settlementNear(block.dimension.id, bell, SETTLEMENT_RADIUS);
  if (s) callSettlementSteward(player, block.dimension, s);
  else if (settlementNear(block.dimension.id, bell, FOUNDING_DISTANCE)) say(player, "bannerforge.steward.claimed_elsewhere");
  else callNeutralSteward(player, block.dimension, bell);
}

function callSettlementSteward(player: Player, dim: Dimension, s: Settlement): void {
  const isNew = !s.steward;
  const st = (s.steward ??= { name: pickName(s.id), skin: pickIndex(s.id + ":skin", 4) });
  const found = findSteward(dim, s.center, (e) => e.getDynamicProperty(P_SETTLEMENT) === s.id, st.entityId);
  if (found) {
    const walking = comeToBell(found, dim, s.center);
    if (st.entityId !== found.id) {
      st.entityId = found.id;
      saveSettlement(s);
    }
    say(player, walking ? "bannerforge.bell.steward_on_way" : "bannerforge.bell.steward_coming", nameTagFor(st.name));
    return;
  }
  const left = respawnTicksLeft(st.diedAt, gameTime());
  if (left > 0) {
    if (isNew) saveSettlement(s);
    say(player, "bannerforge.bell.steward_away", nameTagFor(st.name), String(ticksToMinutes(left)));
    return;
  }
  bringBack(dim, s);
  say(player, "bannerforge.bell.steward_returns", nameTagFor(st.name));
}

function callNeutralSteward(player: Player, dim: Dimension, bell: Vec3): void {
  const key = JSON.stringify(bell);
  const found = findSteward(dim, bell, (e) => e.getDynamicProperty(P_SETTLEMENT) === undefined && e.getDynamicProperty(P_BELL) === key);
  if (found) {
    const walking = comeToBell(found, dim, bell);
    say(player, walking ? "bannerforge.bell.steward_on_way" : "bannerforge.bell.neutral_waiting", found.nameTag);
    return;
  }
  const name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
  spawnSteward(dim, bell, name, Math.floor(Math.random() * 4), OUTFIT_INDEX.neutral);
  say(player, "bannerforge.bell.steward_arrives", nameTagFor(name));
}

// ---- talking -------------------------------------------------------------

export function onTalk(player: Player, steward: Entity): void {
  if (!steward.isValid) return;
  const sid = steward.getDynamicProperty(P_SETTLEMENT);
  if (typeof sid === "string") {
    const s = settlementById(sid);
    if (s) {
      openLedger(player, s, false);
      return;
    }
    // The settlement's data is gone (e.g. removed by an admin): the steward is neutral again.
    steward.setDynamicProperty(P_SETTLEMENT, undefined);
    setOutfit(steward, OUTFIT_INDEX.neutral);
  }
  const bell = parseVec(steward.getDynamicProperty(P_BELL)) ?? floorVec(steward.location);
  const dimensionId = steward.dimension.id;
  if (settlementNear(dimensionId, bell, FOUNDING_DISTANCE)) {
    say(player, "bannerforge.steward.claimed_elsewhere");
    return;
  }
  void showClaimForm(player, dimensionId, bell, (s) => {
    if (!steward.isValid) return;
    steward.setDynamicProperty(P_SETTLEMENT, s.id);
    const name = steward.getDynamicProperty(P_NAME);
    const skin = steward.getDynamicProperty(P_SKIN);
    s.steward = { name: typeof name === "string" ? name : pickName(s.id), skin: typeof skin === "number" ? skin : 0, entityId: steward.id };
    setOutfit(steward, OUTFIT_INDEX[s.faction]);
  });
}

// ---- walking in ----------------------------------------------------------

/** The steward reached the bell (their home): tell the players around. */
function onArrived(e: Entity): void {
  if (!e.isValid || !e.hasTag(WALKING_TAG)) return;
  e.removeTag(WALKING_TAG);
  for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: 64 })) say(p, "bannerforge.steward.at_bell", e.nameTag);
}

// ---- death and return ----------------------------------------------------

function onStewardDied(dead: Entity): void {
  let sid: unknown;
  try {
    sid = dead.getDynamicProperty(P_SETTLEMENT);
  } catch {
    // The entity may already be gone; fall back to the stored entity id.
  }
  const s = typeof sid === "string" ? settlementById(sid) : allSettlements().find((x) => x.steward?.entityId === dead.id);
  if (!s?.steward) return;
  s.steward.diedAt = gameTime();
  delete s.steward.entityId;
  saveSettlement(s);
  world.sendMessage(raw(t("bannerforge.steward.died", nameTagFor(s.steward.name), s.name)));
}

/** Light periodic check: a steward whose day is up returns once a player is near the settlement. */
function returnStewardsNearPlayers(): void {
  const now = gameTime();
  for (const s of allSettlements()) {
    if (s.steward?.diedAt === undefined || respawnTicksLeft(s.steward.diedAt, now) > 0) continue;
    const dim = world.getDimension(s.dimension);
    const players = dim.getPlayers({ location: s.center, maxDistance: 64 });
    if (!players.length) continue;
    bringBack(dim, s);
    for (const p of players) say(p, "bannerforge.steward.returned", nameTagFor(s.steward.name));
  }
}

function bringBack(dim: Dimension, s: Settlement): void {
  const st = s.steward!;
  const e = spawnSteward(dim, s.center, st.name, st.skin, OUTFIT_INDEX[s.faction], s.id);
  st.entityId = e.id;
  delete st.diedAt;
  saveSettlement(s);
}

// ---- helpers -------------------------------------------------------------

function findSteward(dim: Dimension, bell: Vec3, match: (e: Entity) => boolean, entityId?: string): Entity | undefined {
  if (entityId) {
    const e = world.getEntity(entityId);
    if (e?.isValid && e.dimension.id === dim.id && match(e)) return e;
  }
  return dim.getEntities({ type: STEWARD_ID, location: bell, maxDistance: SEARCH_RADIUS }).find(match);
}

/** Spawns the steward at the bell, so the bell becomes their home, then sends them a short walk away to walk in. */
function spawnSteward(dim: Dimension, bell: Vec3, name: string, skin: number, outfit: number, settlementId?: string): Entity {
  const e = dim.spawnEntity(STEWARD_ID, standingSpotNear(dim, bell), { spawnEvent: "bannerforge:spawn_arriving" });
  const start = safeWalkInSpot(dim.id, bell, WALK_FAR, WALK_NEAR);
  if (start) {
    e.addTag(WALKING_TAG);
    e.setDynamicProperty(P_SINCE, gameTime());
    // Same tick (play-test 2026-11-18: a one-tick delay showed the steward at the bell for a moment).
    e.teleport(start);
  } else {
    e.triggerEvent("bannerforge:arrived"); // nowhere safe to walk from: they are already by the bell
  }
  // Tag the steward first: if anything later fails, the next bell ring still finds them (no duplicates).
  e.setDynamicProperty(P_BELL, JSON.stringify(bell));
  e.setDynamicProperty(P_NAME, name);
  e.setDynamicProperty(P_SKIN, skin);
  if (settlementId) e.setDynamicProperty(P_SETTLEMENT, settlementId);
  e.nameTag = nameTagFor(name);
  setOutfit(e, outfit);
  return e;
}

/** Outfit is cosmetic: a failure here must never break founding or spawning. */
function setOutfit(e: Entity, outfit: number): void {
  try {
    e.setProperty("bannerforge_settlements:outfit", outfit);
  } catch (err) {
    console.warn(`[BannerForge] could not set steward outfit: ${String(err)}`);
  }
}

/** Brings the steward to the bell. Returns true if they are still walking in (and left to walk). */
function comeToBell(e: Entity, dim: Dimension, bell: Vec3): boolean {
  if (e.hasTag(WALKING_TAG)) {
    const since = e.getDynamicProperty(P_SINCE);
    if (gameTime() - (typeof since === "number" ? since : 0) < STUCK_TICKS) return true;
    e.triggerEvent("bannerforge:arrived");
    e.removeTag(WALKING_TAG);
  }
  const d = (e.location.x - bell.x) ** 2 + (e.location.z - bell.z) ** 2;
  if (d > 36) e.teleport(standingSpotNear(dim, bell));
  return false;
}

const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];

/** An open spot next to the bell with solid ground, or on top of the bell as a last resort. */
function standingSpotNear(dim: Dimension, bell: Vec3): Vec3 {
  for (const [dx, dz] of OFFSETS) {
    for (const dy of [0, -1, 1]) {
      const at = { x: bell.x + dx, y: bell.y + dy, z: bell.z + dz };
      try {
        const feet = dim.getBlock(at);
        const head = dim.getBlock({ ...at, y: at.y + 1 });
        const ground = dim.getBlock({ ...at, y: at.y - 1 });
        if (feet?.isAir && head?.isAir && ground && !ground.isAir && !ground.isLiquid) return { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
      } catch {
        // unloaded chunk: try the next spot
      }
    }
  }
  return { x: bell.x + 0.5, y: bell.y + 1, z: bell.z + 0.5 };
}

function parseVec(value: unknown): Vec3 | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const v = JSON.parse(value) as Vec3;
    return typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}

const floorVec = (v: Vec3): Vec3 => ({ x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) });
