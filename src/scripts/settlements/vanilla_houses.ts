// Recognising vanilla village houses (research spike 2026-11-18, owner decision "housing in converted villages:
// adopt"). Every vanilla house with beds has a fingerprint (generated/vanilla_houses.ts, tools/vanilla_houses.mjs):
// its beds and up to 32 sample blocks relative to its first bed head. To recognise houses we find the beds inside
// the border, then try every fingerprint in all four turns at each bed head: every bed of the design must be there
// and most sample blocks must match. Loose beds (not part of a recognised house) never count.
// Adoption (owner 2026-11-18): once a day per settlement the houses are looked for again. New ones are adopted
// (their beds count as housing) and get one faction banner by the door; an adopted house that is loaded and no
// longer matches is dropped; one in an unloaded chunk is kept. Dev report: `/scriptevent bannerforge:houses`.

import { type Block, BlockPermutation, BlockVolume, type Dimension, system, type Vector3, world } from "@minecraft/server";
import { gameTime } from "./clock.js";
import { VANILLA_HOUSES, type VanillaHouse } from "./generated/vanilla_houses.js";

/** Villager job blocks (same list as tools/vanilla_houses.mjs). */
const JOB_BLOCKS = ["lectern", "composter", "barrel", "blast_furnace", "smoker", "cartography_table", "brewing_stand", "fletching_table", "grindstone", "cauldron", "loom", "smithing_table", "stonecutter_block"];
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

/** Block types a building is keyed on: beds for houses, villager job blocks for workplaces. */
const KEY_TYPES = ["minecraft:bed", ...JOB_BLOCKS.map((b) => `minecraft:${b}`)];

const turn = (dx: number, dz: number, rot: number): [number, number] =>
  rot === 0 ? [dx, dz] : rot === 1 ? [-dz, dx] : rot === 2 ? [-dx, -dz] : [dz, -dx];

const key = (v: Vector3) => `${v.x},${v.y},${v.z}`;

/** Spreads the scan over ticks (system.runJob); calls done with the result. */
export function scanHouses(dim: Dimension, center: Vector3, radius: number, done: (r: HouseScan) => void): void {
  system.runJob(scan(dim, center, radius, done));
}

function* scan(dim: Dimension, center: Vector3, radius: number, done: (r: HouseScan) => void): Generator<void, void, void> {
  // 1. Key blocks inside the border, one 16 x 16 column at a time: bed heads (houses) and job blocks (workplaces).
  const heads: Vector3[] = [];
  const keys: (Vector3 & { type: string })[] = [];
  let complete = true;
  const y0 = center.y - BELOW;
  const y1 = center.y + ABOVE;
  for (let x = center.x - radius; x <= center.x + radius; x += 16) {
    for (let z = center.z - radius; z <= center.z + radius; z += 16) {
      const to = { x: Math.min(x + 15, center.x + radius), y: y1, z: Math.min(z + 15, center.z + radius) };
      try {
        const list = dim.getBlocks(new BlockVolume({ x, y: y0, z }, to), { includeTypes: KEY_TYPES }, false);
        for (const at of list.getBlockLocationIterator()) {
          const b = dim.getBlock(at);
          if (!b) continue;
          if (b.typeId !== "minecraft:bed") keys.push({ ...at, type: b.typeId.replace("minecraft:", "") });
          else if (b.permutation.getState("head_piece_bit") === true) {
            heads.push(at);
            keys.push({ ...at, type: "bed" });
          }
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
  for (const h of keys) {
    let best: FoundHouse | undefined;
    for (const fp of VANILLA_HOUSES) {
      if (fp.heads[0][3] !== h.type) continue;
      for (let rot = 0; rot < 4; rot++) {
        const s = score(fp, h, rot, typeAt);
        if (s < MIN_SCORE) continue;
        const better = !best || s > best.score + TIE || (s > best.score - TIE && (fp.beds > best.beds || (fp.beds === best.beds && s > best.score)));
        if (better) best = { id: fp.id, beds: fp.beds, at: { x: h.x, y: h.y, z: h.z }, rot, score: s };
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
    const own = (fp.heads as [number, number, number][]).map(([dx, dy, dz]) => {
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
  for (const [dx, dy, dz, name] of fp.heads as [number, number, number, string][]) {
    const [rx, rz] = turn(dx, dz, rot);
    if (typeAt(at.x + rx, at.y + dy, at.z + rz) !== name) return 0; // every bed (or job block) of the design is there
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
  if (scanning.size) return; // one town at a time (ticking areas are limited per world)
  scanning.add(s.id);
  // Owner 2026-11-18: every house inside the border must be found in one go, so the whole border is loaded first.
  loadBorder(dim, s, (release) => scanHouses(dim, s.center, BORDER_RADIUS[tier(s)], (r) => {
    // Keep the area loaded a little longer: villagers out there get converted meanwhile (people.ts, every 5 s).
    system.runTimeout(release, KEEP_LOADED_TICKS);
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
    for (const h of fresh) {
      h.banner = putUpBanner(dim, h, now.faction);
      h.bannerV = BANNER_VERSION;
    }
    // Banners hung by the old rule are hung again by the new one, once, when the house is loaded.
    for (const h of kept) {
      if (h.bannerV === BANNER_VERSION || !h.banner) continue;
      try {
        if (!dim.getBlock({ x: h.x, y: h.y, z: h.z })) continue;
      } catch {
        continue;
      }
      h.banner = putUpBanner(dim, h, now.faction);
      h.bannerV = BANNER_VERSION;
    }
    now.adopted = [...kept, ...fresh];
    now.housesDay = day;
    if (r.complete) retryAt.delete(s.id);
    else retryAt.set(s.id, system.currentTick + RETRY_TICKS);
    saveSettlement(now);
    const newBeds = fresh.reduce((n, h) => n + h.beds, 0);
    const newHouses = fresh.filter((h) => h.beds > 0).length;
    if (newHouses) tell(now, raw(txt("§a"), t("bannerforge.houses.adopted", String(newHouses), String(newBeds))));
    if (lostBeds) tell(now, raw(txt("§6"), t("bannerforge.houses.lost", String(lostBeds))));
  }));
}

/** How long the border stays loaded after a look, so villagers out there can be converted. */
const KEEP_LOADED_TICKS = 400;
/** Waiting for the ticking areas to load: checks every second, at most this many times. */
const LOAD_CHECKS = 20;

/**
 * Loads the whole border with temporary ticking areas (four quarters: a city border is too big for one), waits until
 * every chunk answers, then calls next with a function that removes the areas again. If loading takes too long the
 * look still runs (incomplete: it is retried a minute later).
 */
function loadBorder(dim: Dimension, s: Settlement, next: (release: () => void) => void): void {
  const r = BORDER_RADIUS[tier(s)];
  const { x, y, z } = s.center;
  const tag = `bf_${s.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`;
  const quarters = [
    [x - r, z - r, x, z],
    [x + 1, z - r, x + r, z],
    [x - r, z + 1, x, z + r],
    [x + 1, z + 1, x + r, z + r],
  ];
  const names: string[] = [];
  quarters.forEach(([x0, z0, x1, z1], i) => {
    const name = `${tag}_${i}`;
    try {
      dim.runCommand(`tickingarea add ${x0} ${y} ${z0} ${x1} ${y} ${z1} ${name}`);
      names.push(name);
    } catch (err) {
      console.warn(`[BannerForge] tickingarea ${name}: ${String(err)}`);
    }
  });
  const release = () => {
    for (const name of names) {
      try {
        dim.runCommand(`tickingarea remove ${name}`);
      } catch {
        // already gone
      }
    }
  };
  const loaded = (): boolean => {
    for (let cx = x - r; cx <= x + r; cx += 16) {
      for (let cz = z - r; cz <= z + r; cz += 16) {
        try {
          if (!dim.getBlock({ x: cx, y, z: cz })) return false;
        } catch {
          return false;
        }
      }
    }
    return true;
  };
  let checks = 0;
  const id = system.runInterval(() => {
    if (loaded() || ++checks >= LOAD_CHECKS) {
      system.clearRun(id);
      next(release);
    }
  }, 20);
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
/** Placement rule version: 2 = beside the door, one block up, never by another door (owner 2026-11-19). */
const BANNER_VERSION = 2;

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
  const isDoor = (b: Block | undefined) => !!b && b.typeId.includes("door");
  const solid = (b: Block | undefined) => !!b && !b.isAir && !b.isLiquid && !isDoor(b);
  try {
    // An older banner of ours beside this door comes down first (placement rules changed 2026-11-19).
    for (const side of [1, -1]) {
      for (let dy = 0; dy <= 2; dy++) {
        const b = dim.getBlock({ x: door.x - oz * side + ox, y: door.y + dy, z: door.z + ox * side + oz });
        if (b?.typeId.startsWith("bannerforge_settlements:banner_")) b.setType("minecraft:air");
      }
    }
    // Owner 2026-11-19: beside the door and one block up; never on or over another door. `up` 1 first, then on the
    // ground as before when the wall is too low.
    for (const up of [1, 0]) {
      for (const side of [1, -1]) {
        const wx = door.x - oz * side;
        const wz = door.z + ox * side;
        const at = (dy: number, out: boolean) => dim.getBlock({ x: wx + (out ? ox : 0), y: door.y + dy, z: wz + (out ? oz : 0) });
        // The wall behind both halves, and no door in this column (a double door, a second entrance).
        if (!solid(at(up, false)) || !solid(at(up + 1, false))) continue;
        if (isDoor(at(0, false)) || isDoor(at(1, false)) || isDoor(at(0, true)) || isDoor(at(1, true))) continue;
        const bottom = at(up, true);
        const top = at(up + 1, true);
        if (!bottom?.isAir || !top?.isAir) continue;
        top.setPermutation(BlockPermutation.resolve(id, { "bannerforge_settlements:part": "top", "minecraft:cardinal_direction": facing }));
        bottom.setPermutation(BlockPermutation.resolve(id, { "bannerforge_settlements:part": "bottom", "minecraft:cardinal_direction": facing }));
        return true;
      }
    }
  } catch (err) {
    console.warn(`[BannerForge] banner at ${h.design}: ${String(err)}`);
  }
  return false;
}
