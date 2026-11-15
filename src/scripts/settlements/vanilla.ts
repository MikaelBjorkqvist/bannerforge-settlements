// Finding vanilla village structures (houses, farms, wells) around a player who is placing a building.
// The stable Script API has no structure bounds, so (owner decision, 2026-11-15) we scan: anchor blocks such as
// beds, workstations and doors, then the connected man-made blocks around them give each structure's outline.
// Results are cached per settlement for this game session.

import type { Dimension } from "@minecraft/server";
import { rectContains, rectOverlaps, type Footprint, type Rect } from "./plots.js";
import { ANCHOR, isLiquid, isManMade } from "./terrain.js";

interface Cache {
  scanned: Set<string>;
  boxes: Rect[];
}

const caches = new Map<string, Cache>();
const cacheFor = (sid: string): Cache => {
  let c = caches.get(sid);
  if (!c) caches.set(sid, (c = { scanned: new Set(), boxes: [] }));
  return c;
};

export const vanillaBoxes = (sid: string): Rect[] => cacheFor(sid).boxes;

/** Forget structures under a plot once it has been cleared for building. */
export function forgetVanillaIn(sid: string, f: Footprint): void {
  const c = cacheFor(sid);
  c.boxes = c.boxes.filter((b) => !rectOverlaps(f, b));
}

const STRIDE = 2;
const MAX_FILL = 3000;
/** Blocks a structure may also be made of while following it (log pillars of plains houses). */
const PART = (id: string) => isManMade(id) || /_log$|stripped_|water/.test(id);

/**
 * Scans columns within `radius` of (cx, cz) that haven't been scanned yet. Generator for system.runJob.
 * `skip` = plots of the settlement's own buildings (never reported as vanilla).
 */
export function* scanAround(dim: Dimension, sid: string, cx: number, cz: number, radius: number, floorY: number, skip: Footprint[]): Generator<void, void, void> {
  const cache = cacheFor(sid);
  const x0 = Math.floor((cx - radius) / STRIDE) * STRIDE;
  const z0 = Math.floor((cz - radius) / STRIDE) * STRIDE;
  let work = 0;
  for (let x = x0; x <= cx + radius; x += STRIDE) {
    for (let z = z0; z <= cz + radius; z += STRIDE) {
      const key = `${x},${z}`;
      if (cache.scanned.has(key)) continue;
      if (cache.boxes.some((b) => rectContains(b, x, z)) || skip.some((f) => x >= f.x && x < f.x + f.w && z >= f.z && z < f.z + f.w)) {
        cache.scanned.add(key);
        continue;
      }
      const anchor = findAnchor(dim, x, z, floorY);
      if (anchor === null) continue; // unloaded: try again on a later scan
      cache.scanned.add(key);
      if (anchor) {
        const box = traceStructure(dim, anchor.x, anchor.y, anchor.z);
        if (box && !skip.some((f) => rectOverlaps(f, box))) cache.boxes.push(box);
      }
      if (++work % 24 === 0) yield;
    }
  }
}

/** Top-down: the first anchor block in the column, undefined if none, null if unloaded. */
function findAnchor(dim: Dimension, x: number, z: number, floorY: number): { x: number; y: number; z: number } | undefined | null {
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top) return undefined;
    for (let y = top.location.y; y > Math.max(floorY, top.location.y - 12); y--) {
      const id = dim.getBlock({ x, y, z })?.typeId ?? "";
      if (ANCHOR.test(id) || /farmland/.test(id)) return { x, y, z };
    }
    return undefined;
  } catch {
    return null;
  }
}

/** Follows connected structure blocks from an anchor; returns its outline on the ground. */
function traceStructure(dim: Dimension, sx: number, sy: number, sz: number): Rect | undefined {
  const seen = new Set<string>();
  const queue: [number, number, number][] = [[sx, sy, sz]];
  let minX = sx, maxX = sx, minZ = sz, maxZ = sz;
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (queue.length && seen.size < MAX_FILL) {
    const [x, y, z] = queue.pop()!;
    const k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (seen.has(`${nx},${ny},${nz}`)) continue;
      let id = "";
      try {
        id = dim.getBlock({ x: nx, y: ny, z: nz })?.typeId ?? "";
      } catch {
        continue;
      }
      // Water only joins a structure next to farmland (farm channels), not lakes.
      if (isLiquid(id) && !nearFarmland(dim, nx, ny, nz)) continue;
      if (PART(id)) queue.push([nx, ny, nz]);
    }
  }
  if (seen.size < 6) return undefined; // a lone door or bed in the wild is not a structure
  return { x: minX, z: minZ, wx: maxX - minX + 1, wz: maxZ - minZ + 1 };
}

function nearFarmland(dim: Dimension, x: number, y: number, z: number): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    try {
      if (/farmland/.test(dim.getBlock({ x: x + dx, y, z: z + dz })?.typeId ?? "")) return true;
    } catch {
      // ignore
    }
  }
  return false;
}
