// Recognising vanilla village houses (research spike 2026-11-18, owner decision "housing in converted villages:
// adopt"). Every vanilla house with beds has a fingerprint (generated/vanilla_houses.ts, tools/vanilla_houses.mjs):
// its beds and up to 32 sample blocks relative to its first bed head. To recognise houses we find the beds inside
// the border, then try every fingerprint in all four turns at each bed head: every bed of the design must be there
// and most sample blocks must match. Loose beds (not part of a recognised house) never count.
// Spike: a dev report only (`/scriptevent bannerforge:houses`); adopting the houses as sites comes next.

import { BlockVolume, type Dimension, system, type Vector3 } from "@minecraft/server";
import { VANILLA_HOUSES, type VanillaHouse } from "./generated/vanilla_houses.js";

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
        // not loaded: those beds are left out (the scan can run again later)
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
  done({ houses, loose: heads.filter((h) => !used.has(key(h))) });
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
