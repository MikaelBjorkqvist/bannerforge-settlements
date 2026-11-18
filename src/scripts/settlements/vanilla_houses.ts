// Recognising vanilla village houses (research spike 2026-11-18, owner decision "housing in converted villages:
// adopt"). Every vanilla house with beds has a fingerprint (generated/vanilla_houses.ts, tools/vanilla_houses.mjs):
// its beds and up to 32 sample blocks relative to its first bed head. To recognise houses we find the beds inside
// the border, then try every fingerprint in all four turns at each bed head: every bed of the design must be there
// and most sample blocks must match. Loose beds (not part of a recognised house) never count.
// Adoption (owner 2026-11-18): once a day per settlement the houses are looked for again. New ones are adopted
// (their beds count as housing) and get one faction banner by the door; an adopted house that is loaded and no
// longer matches is dropped; one in an unloaded chunk is kept. Dev report: `/scriptevent bannerforge:houses`.

import { BlockPermutation, BlockVolume, type Dimension, system, type Vector3, world } from "@minecraft/server";
import { gameTime } from "./clock.js";
import { VANILLA_HOUSES, type VanillaHouse } from "./generated/vanilla_houses.js";
import { BORDER_RADIUS } from "./plots.js";
import { saveSettlement, settlementById } from "./registry.js";
import { tier } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { AdoptedHouse, Settlement } from "./types.js";

/** Share of sample blocks that must match. Damaged or lived-in houses still pass; other designs score lower. */
const MIN_SCORE = 0.7;
/** Within this much of the best score, the design with more beds wins (a medium house contains a small one's bed). */
const TIE = 0.1;
/** Height searched for beds around the bell. */
const BELOW = 16;
const ABOVE = 24;

export interface FoundHouse {
  id: string;
  beds: number;
  /** World position of the design's first bed head. */
  at: Vector3;
  rot: number;
  score: number;
}

export interface HouseScan {
  /** False if part of the area couldn't be read (chunks not loaded): look again soon. */
  complete: boolean;
  houses: FoundHouse[];
  /** Bed heads that belong to no recognised house. */
  loose: Vector3[];
}

const turn = (dx: number, dz: number, rot: number): [number, number] =>
  rot === 0 ? [dx, dz] : rot === 1 ? [-dz, dx] : rot === 2 ? [-dx, -dz] : [dz, -dx];

const key = (v: Vector3) => `${v.x},${v.y},${v.z}`;

/** Spreads the scan over ticks (system.runJob); calls done with the result. */
export function scanHouses(dim: Dimension, center: Vector3, radius: number, done: (r: HouseScan) => void): void {
  system.runJob(scan(dim, center, radius, done));
}

function* scan(dim: Dimension, center: Vector3, radius: number, done: (r: HouseScan) => void): Generator<void, void, void> {
  // 1. Bed heads inside the border, one 16 x 16 column at a time.
  const heads: Vector3[] = [];
  let complete = true;
  const y0 = center.y - BELOW;
  const y1 = center.y + ABOVE;
  for (let x = center.x - radius; x <= center.x + radius; x += 16) {
    for (let z = center.z - radius; z <= center.z + radius; z += 16) {
      const to = { x: Math.min(x + 15, center.x + radius), y: y1, z: Math.min(z + 15, center.z + radius) };
      try {
        const list = dim.getBlocks(new BlockVolume({ x, y: y0, z }, to), { includeTypes: ["minecraft:bed"] }, false);
        for (const at of list.getBlockLocationIterator()) {
          if (dim.getBlock(at)?.permutation.getState("head_piece_bit") === true) heads.push(at);
        }
      } catch {
        complete = false; // not loaded: those beds are left out, the town looks again soon
      }
      yield;
    }
  }

  // 2. Each head against every design and turn; best first, so a house claims all of its beds.
  const typeAt = (x: number, y: number, z: number): string | undefined => {
    try {
      return dim.getBlock({ x, y, z })?.typeId.replace("minecraft:", "");
    } catch {
      return undefined;
    }
  };
  const candidates: FoundHouse[] = [];
  for (const h of heads) {
    let best: FoundHouse | undefined;
    for (const fp of VANILLA_HOUSES) {
      for (let rot = 0; rot < 4; rot++) {
        const s = score(fp, h, rot, typeAt);
        if (s < MIN_SCORE) continue;
        const better = !best || s > best.score + TIE || (s > best.score - TIE && (fp.beds > best.beds || (fp.beds === best.beds && s > best.score)));
        if (better) best = { id: fp.id, beds: fp.beds, at: h, rot, score: s };
      }
    }
    if (best) candidates.push(best);
    yield;
  }
  candidates.sort((a, b) => b.beds - a.beds || b.score - a.score);
  const used = new Set<string>();
  const houses: FoundHouse[] = [];
  for (const c of candidates) {
    const fp = VANILLA_HOUSES.find((f) => f.id === c.id)!;
    const own = fp.heads.map(([dx, dy, dz]) => {
      const [rx, rz] = turn(dx, dz, c.rot);
      return key({ x: c.at.x + rx, y: c.at.y + dy, z: c.at.z + rz });
    });
    if (own.some((k) => used.has(k))) continue;
    own.forEach((k) => used.add(k));
    houses.push(c);
  }
  done({ complete, houses, loose: heads.filter((h) => !used.has(key(h))) });
}

/** Share of anchors that match; 0 unless every bed of the design is there. Same maths as tools/vanilla_houses.mjs. */
function score(fp: VanillaHouse, at: Vector3, rot: number, typeAt: (x: number, y: number, z: number) => string | undefined): number {
  for (const [dx, dy, dz] of fp.heads) {
    const [rx, rz] = turn(dx, dz, rot);
    if (typeAt(at.x + rx, at.y + dy, at.z + rz) !== "bed") return 0;
  }
  let ok = 0;
  for (const [dx, dy, dz, names] of fp.anchors as [number, number, number, string][]) {
    const [rx, rz] = turn(dx, dz, rot);
    const got = typeAt(at.x + rx, at.y + dy, at.z + rz);
    if (got && names.split("|").includes(got)) ok++;
  }
  return ok / fp.anchors.length;
}

// ---- adoption ----------------------------------------------------------------------------------------------------

const scanning = new Set<string>();
/** Play-test 2026-11-18: houses near the border were missed at founding (chunks not loaded) and only adopted the next
 *  day. An incomplete look is repeated after this many ticks. */
const RETRY_TICKS = 1200;
const retryAt = new Map<string, number>();
const keyOf = (h: { x: number; y: number; z: number }) => `${h.x},${h.y},${h.z}`;
const DIR_NAME: Record<string, string> = { "0,-1": "north", "0,1": "south", "1,0": "east", "-1,0": "west" };

/**
 * Once a day (and soon after founding): look for vanilla houses and update the adopted list. Calls tell(news) with
 * what changed. Cheap to call often: it starts at most one scan per settlement per day.
 */
export function adoptHousesDaily(s: Settlement, tell: (s: Settlement, msg: ReturnType<typeof raw>) => void): void {
  const day = Math.floor(gameTime() / 24000);
  if (scanning.has(s.id)) return;
  const again = retryAt.get(s.id);
  if (s.housesDay === day && (again === undefined || system.currentTick < again)) return;
  const dim = world.getDimension(s.dimension);
  if (!dim.getPlayers({ location: s.center, maxDistance: BORDER_RADIUS[tier(s)] + 32 }).length) return; // nobody near: chunks not loaded
  scanning.add(s.id);
  scanHouses(dim, s.center, BORDER_RADIUS[tier(s)], (r) => {
    scanning.delete(s.id);
    const now = settlementById(s.id);
    if (!now) return;
    const old = now.adopted ?? [];
    const kept: AdoptedHouse[] = [];
    let lostBeds = 0;
    for (const h of old) {
      const v = verify(dim, h);
      if (v === "gone") lostBeds += h.beds;
      else kept.push(h);
    }
    const have = new Set(kept.map(keyOf));
    const fresh = r.houses
      .filter((h) => !have.has(keyOf(h.at)))
      .map((h): AdoptedHouse => ({ design: h.id, x: h.at.x, y: h.at.y, z: h.at.z, rot: h.rot, beds: h.beds }));
    for (const h of fresh) h.banner = putUpBanner(dim, h, now.faction);
    now.adopted = [...kept, ...fresh];
    now.housesDay = day;
    if (r.complete) retryAt.delete(s.id);
    else retryAt.set(s.id, system.currentTick + RETRY_TICKS);
    saveSettlement(now);
    const newBeds = fresh.reduce((n, h) => n + h.beds, 0);
    if (fresh.length) tell(now, raw(txt("§a"), t("bannerforge.houses.adopted", String(fresh.length), String(newBeds))));
    if (lostBeds) tell(now, raw(txt("§6"), t("bannerforge.houses.lost", String(lostBeds))));
  });
}

/** Is an adopted house still there? "unloaded" if its chunk can't be read now. */
function verify(dim: Dimension, h: AdoptedHouse): "ok" | "gone" | "unloaded" {
  const fp = VANILLA_HOUSES.find((f) => f.id === h.design);
  if (!fp) return "gone";
  let unloaded = false;
  const typeAt = (x: number, y: number, z: number): string | undefined => {
    try {
      const b = dim.getBlock({ x, y, z });
      if (!b) unloaded = true;
      return b?.typeId.replace("minecraft:", "");
    } catch {
      unloaded = true;
      return undefined;
    }
  };
  const sc = score(fp, h, h.rot, typeAt);
  if (unloaded) return "unloaded";
  return sc >= MIN_SCORE ? "ok" : "gone";
}

/**
 * One faction banner beside the front door, on the outside wall (2 blocks: top at door height + 1).
 * Returns false if there is no room (the house still counts).
 */
function putUpBanner(dim: Dimension, h: AdoptedHouse, faction: string): boolean {
  const fp = VANILLA_HOUSES.find((f) => f.id === h.design);
  if (!fp?.entrance) return false;
  const [ddx, ddy, ddz] = fp.entrance.door;
  const [rdx, rdz] = turn(ddx, ddz, h.rot);
  const door = { x: h.x + rdx, y: h.y + ddy, z: h.z + rdz };
  const [ox, oz] = turn(fp.entrance.out[0], fp.entrance.out[1], h.rot);
  const facing = DIR_NAME[`${ox},${oz}`];
  if (!facing) return false;
  const id = `bannerforge_settlements:banner_${faction}`;
  try {
    for (const side of [1, -1]) {
      const lx = -oz * side;
      const lz = ox * side;
      const wall = dim.getBlock({ x: door.x + lx, y: door.y, z: door.z + lz });
      const wallUp = dim.getBlock({ x: door.x + lx, y: door.y + 1, z: door.z + lz });
      const bottom = dim.getBlock({ x: door.x + lx + ox, y: door.y, z: door.z + lz + oz });
      const top = dim.getBlock({ x: door.x + lx + ox, y: door.y + 1, z: door.z + lz + oz });
      if (!wall || !wallUp || !bottom || !top) continue;
      if (wall.isAir || wall.isLiquid || wallUp.isAir || !bottom.isAir || !top.isAir) continue;
      top.setPermutation(BlockPermutation.resolve(id, { "bannerforge_settlements:part": "top", "minecraft:cardinal_direction": facing }));
      bottom.setPermutation(BlockPermutation.resolve(id, { "bannerforge_settlements:part": "bottom", "minecraft:cardinal_direction": facing }));
      return true;
    }
  } catch (err) {
    console.warn(`[BannerForge] banner at ${h.design}: ${String(err)}`);
  }
  return false;
}
