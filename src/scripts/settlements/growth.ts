// How towns grow (owner 2026-11-18): nobody just moves in any more.
// - Births: at dawn one child per staffed food building (Farmstead, Docks), only into free beds (rules.morning,
//   roster.addChild). The child is born in a house, counts at once, and grows up into a free settler after a day.
// - Newcomers: once a Town Hall stands, one newcomer a day walks in from a safe spot to the Town Hall door and waits
//   there (yellow name). The player talks to them: Welcome (needs a free bed) or Not now. Unanswered, they move on
//   after two days. No cost for turning people away. The ledger only says that someone is waiting.
// Performance: one pass every 5 seconds; at most one spawn per settlement per pass.

import { type Entity, type Player, system, type Vector3, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean } from "@minecraft/server-ui";
import { CITIZEN_ID } from "./citizen_npc.js";
import { gameTime } from "./clock.js";
import { copyLook } from "./convert.js";
import { doorOfSite } from "./garrison.js";
import { news, ofTag, safeBorderSpot, safeWalkInSpot } from "./people.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { acceptApplicant, addApplicant, applicantsOf, childrenOf, dropApplicant } from "./roster.js";
import { freeBeds, instances, tier } from "./rules.js";
import { raw, t, txt } from "./text.js";
import { OUTFIT_INDEX, type Person, type Settlement, type Site } from "./types.js";
import { walkFrom } from "./walk.js";

const INTERVAL = 100;
const DAWN = 1000;
/** Newcomers set off in the morning only (play-test 2026-11-18: one came right after a midday Town Hall). */
const MORNING_END = 4000;
/** A newcomer waits this long for an answer. */
const WAIT_TICKS = 2 * 24000;
/** Within this distance of the Town Hall door a newcomer counts as waiting there. */
const AT_DOOR = 4;
const COOLDOWN_TICKS = 20;
/** Longest walk to the Town Hall door before a newcomer is simply put there. */
const WALK_TICKS = 900;
/** How many ways a newcomer asks and says thanks (lang: bannerforge.newcomer.asks.N / thanks.N). */
const LINES = 5;
/** The same newcomer always says the same line. */
const lineOf = (p: Person, salt: number) => ([...p.seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7 + salt) % LINES) + 1;
/** A turned-away newcomer walks off for at most this long before they are gone. */
const LEAVE_TICKS = 600;
const LEAVING = "bannerforge:leaving";
const P_LEFT = "bannerforge:left";
/** Where a turned-away newcomer leaves town ("x,z"); he goes for good when he gets there. */
const P_EXIT = "bannerforge:exit";
/** Longest walk out (the leaving group's follow range is 128). */
const LEAVE_WALK = 100;

/** Out of the town's lists: they walk off with their own name, no longer a newcomer (no talk, no yellow). */
/**
 * A turned-away newcomer walks straight out of town (play-test 2026-11-19: running from the player went in circles).
 * The behaviour file walks him home (citizen.json leaving: go_home), so he is spawned at the nearest spot just
 * outside the border and moved back to where he stood (walk.ts). Falls back to leaving on the spot's line while that
 * spot isn't loaded.
 */
function sendAway(s: Settlement, old: Entity, p: Person): void {
  const r = BORDER_RADIUS[tier(s)] + 6;
  const dx = old.location.x - s.center.x;
  const dz = old.location.z - s.center.z;
  // Out through the nearest side of the (square) border.
  const exit =
    Math.abs(dx) >= Math.abs(dz)
      ? { x: s.center.x + Math.sign(dx || 1) * r, z: old.location.z }
      : { x: old.location.x, z: s.center.z + Math.sign(dz || 1) * r };
  let e = old;
  try {
    const top = old.dimension.getTopmostBlock({ x: exit.x, z: exit.z });
    if (top) {
      const at = { x: Math.floor(exit.x) + 0.5, y: top.location.y + 1, z: Math.floor(exit.z) + 0.5 };
      e = old.dimension.spawnEntity(CITIZEN_ID, at, { spawnEvent: "bannerforge:spawn_leaving" });
      copyLook(old, e);
      walkFrom(e, old.location, at, LEAVE_WALK);
      old.remove();
      e.setDynamicProperty(P_EXIT, `${at.x},${at.z}`);
    }
  } catch {
    // exit not loaded: leave from here
  }
  if (e === old) old.triggerEvent("bannerforge:leave");
  e.nameTag = p.name;
  for (const tag of e.getTags()) if (tag.startsWith("bannerforge:of:")) e.removeTag(tag);
  e.addTag(LEAVING);
  e.setDynamicProperty(P_LEFT, gameTime());
}

/** Newcomers' name tags are yellow (name tags can't be translated; the colour marks them). */
const applicantTag = (p: Person) => `§e${p.name}`;

export function registerGrowth(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        if (tick(s)) saveSettlement(s);
      } catch (err) {
        console.warn(`[BannerForge] growth ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);

  const lastUse = new Map<string, number>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const e = ev.target;
    if (e.typeId !== CITIZEN_ID || e.getProperty("bannerforge_settlements:role") !== "applicant") return;
    ev.cancel = true;
    const now = system.currentTick;
    if (now - (lastUse.get(ev.player.id) ?? -COOLDOWN_TICKS) < COOLDOWN_TICKS) return;
    lastUse.set(ev.player.id, now);
    const { player } = ev;
    system.run(() => talk(player, e));
  });
}

function tick(s: Settlement): boolean {
  let changed = false;
  const dim = world.getDimension(s.dimension);

  // Children born at dawn get their entity in a house.
  for (const c of childrenOf(s)) {
    if (c.eid) continue;
    const at = birthSpot(s);
    if (!at) continue;
    try {
      const e = dim.spawnEntity(CITIZEN_ID, at, { spawnEvent: "bannerforge:spawn_child" });
      e.nameTag = c.name;
      e.addTag(ofTag(s));
      setOutfit(e, s);
      c.eid = e.id;
      changed = true;
      news(s, raw(txt("§a"), t("bannerforge.people.born", c.name, s.name)));
    } catch {
      // not loaded right now: next pass
    }
  }

  // Newcomers: arrive at the door, or give up after two days.
  const hall = townHall(s);
  for (const p of [...applicantsOf(s)]) {
    const e = p.eid ? world.getEntity(p.eid) : undefined;
    if (gameTime() - (p.since ?? 0) >= WAIT_TICKS) {
      if (e) sendAway(s, e, p);
      dropApplicant(s, p);
      changed = true;
      news(s, raw(txt("§7"), t("bannerforge.newcomer.moved_on", p.name)));
      continue;
    }
    if (p.state === "walking" && e && hall) {
      const door = doorOfSite(dim, hall);
      // Taking too long (stuck, lost): he is put at the door, so the town is never told about someone who isn't there.
      if (door && gameTime() - (p.since ?? 0) >= WALK_TICKS) e.teleport(door);
      if (door && Math.abs(e.location.x - door.x) <= AT_DOOR && Math.abs(e.location.z - door.z) <= AT_DOOR) {
        p.state = "here";
        changed = true;
        news(s, raw(txt("§e"), t("bannerforge.newcomer.waiting", p.name)));
      }
    }
  }

  // Turned-away newcomers walk off; they go for good out of sight or after LEAVE_TICKS.
  for (const e of dim.getEntities({ type: CITIZEN_ID, tags: [LEAVING], location: s.center, maxDistance: 256 })) {
    const since = e.getDynamicProperty(P_LEFT);
    const near = dim.getPlayers({ location: e.location, maxDistance: 20 }).length > 0;
    const exit = String(e.getDynamicProperty(P_EXIT) ?? "").split(",").map(Number);
    const out = exit.length === 2 && Math.hypot(e.location.x - exit[0], e.location.z - exit[1]) < 4;
    if (out || !near || gameTime() - (typeof since === "number" ? since : 0) >= LEAVE_TICKS) e.remove();
  }

  // One newcomer a day, by day, once the Town Hall stands.
  const c = s.citizens;
  const day = Math.floor(gameTime() / 24000);
  const tod = gameTime() % 24000;
  if (hall && c && c.applicantDay !== day && tod >= DAWN && tod < MORNING_END) {
    const door = doorOfSite(dim, hall);
    // A short walk up to the door (play-test 2026-11-19: from the border it took far too long).
    const start = door && (safeWalkInSpot(s.dimension, door, 28, 12) ?? safeBorderSpot(s));
    if (door && start) {
      const p = addApplicant(s);
      const e = dim.spawnEntity(CITIZEN_ID, door, { spawnEvent: "bannerforge:spawn_applicant" });
      e.nameTag = applicantTag(p);
      e.addTag(ofTag(s));
      setOutfit(e, s);
      p.eid = e.id;
      p.state = "walking";
      p.since = gameTime();
      c.applicantDay = day;
      changed = true;
      // Spawned at the door so the door is their home, and moved out in the same tick (no flash at the door).
      // The town hears of him when he stands at the door (play-test 2026-11-19: "on the way" read as "is there").
      e.teleport(start);
    }
  }
  return changed;
}

/**
 * A welcomed newcomer walks off to a house (owner 2026-11-19): a settler with the same look is spawned in a house and
 * walks there from the Town Hall door (citizen.json moving_in). No house loaded right now: he becomes a settler on
 * the spot.
 */
function moveIn(s: Settlement, p: Person, old: Entity): void {
  const at = houseSpot(s);
  if (!at) {
    old.triggerEvent("bannerforge:become_settler");
    old.nameTag = p.name;
    return;
  }
  const e = old.dimension.spawnEntity(CITIZEN_ID, at, { spawnEvent: "bannerforge:spawn_moving_in" });
  copyLook(old, e);
  setOutfit(e, s);
  e.nameTag = p.name;
  e.addTag(ofTag(s));
  walkFrom(e, old.location, at, 80);
  old.remove();
  p.eid = e.id;
}

/** The standing Town Hall's site, if any. */
function townHall(s: Settlement): Site | undefined {
  const i = instances(s, "town_hall").findIndex((l, k) => l > 0 && (s.sites?.town_hall?.[k]?.built ?? 0) > 0);
  return i >= 0 ? (s.sites?.town_hall?.[i] ?? undefined) : undefined;
}

/** A house to be born in: an adopted vanilla house's bed, or the middle of one of our houses, else the bell. */
function birthSpot(s: Settlement): Vector3 | undefined {
  return houseSpot(s, true);
}

/** A loaded spot in one of the town's houses (with `orBell`, the bell when the town has no house). */
function houseSpot(s: Settlement, orBell = false): Vector3 | undefined {
  const spots: Vector3[] = [];
  for (const h of s.adopted ?? []) spots.push({ x: h.x + 0.5, y: h.y + 1, z: h.z + 0.5 });
  for (const site of s.sites?.house ?? []) {
    if (site && site.built > 0) spots.push({ x: site.x + site.w / 2, y: site.y + 1, z: site.z + (site.d ?? site.w) / 2 });
  }
  if (!spots.length && !orBell) return undefined;
  const pick = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: s.center.x + 0.5, y: s.center.y + 1, z: s.center.z + 1.5 };
  try {
    return world.getDimension(s.dimension).getBlock(pick) ? pick : undefined;
  } catch {
    return undefined;
  }
}

function setOutfit(e: Entity, s: Settlement): void {
  try {
    e.setProperty("bannerforge_settlements:outfit", OUTFIT_INDEX[s.faction as keyof typeof OUTFIT_INDEX] ?? 0);
  } catch {
    // look property is optional
  }
}

/** Talking to a newcomer: Welcome (needs a free bed) or Not now. */
export function talk(player: Player, e: Entity): void {
  if (!e.isValid) return;
  const s = allSettlements().find((x) => applicantsOf(x).some((p) => p.eid === e.id));
  const p = s && applicantsOf(s).find((q) => q.eid === e.id);
  if (!s || !p) return;
  const beds = freeBeds(s);
  const form = new CustomForm(player, raw(txt(p.name)));
  form.label(raw(t(`bannerforge.newcomer.asks.${lineOf(p, 0)}`, s.name), ...(beds > 0 ? [] : [txt("\n\n§c"), t("bannerforge.newcomer.no_bed")])));
  form.button(t("bannerforge.newcomer.welcome"), () => {
    form.close();
    system.run(() => decide(player, s.id, p.seed, true));
  }, { disabled: new ObservableBoolean(beds <= 0) });
  form.button(t("bannerforge.newcomer.not_now"), () => {
    form.close();
    system.run(() => decide(player, s.id, p.seed, false));
  });
  form.show().catch((err) => console.warn(`[BannerForge] newcomer: ${err}`));
}

function decide(player: Player, sid: string, seed: string, welcome: boolean): void {
  const s = settlementById(sid);
  const p = s && applicantsOf(s).find((q) => q.seed === seed);
  if (!s || !p) return;
  const e = p.eid ? world.getEntity(p.eid) : undefined;
  if (welcome) {
    if (!acceptApplicant(s, p, freeBeds(s))) return;
    player.sendMessage(raw(txt(`§e${p.name}§r: `), t(`bannerforge.newcomer.thanks.${lineOf(p, 1)}`)));
    if (e) moveIn(s, p, e);
    news(s, raw(txt("§a"), t("bannerforge.newcomer.settled", p.name, s.name)));
  } else {
    dropApplicant(s, p);
    if (e) sendAway(s, e, p);
    news(s, raw(txt("§7"), t("bannerforge.newcomer.moved_on", p.name)));
  }
  saveSettlement(s);
}
