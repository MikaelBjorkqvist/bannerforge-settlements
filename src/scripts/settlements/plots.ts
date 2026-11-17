// Plot geometry and construction timing. Pure functions (no game imports), unit-tested in tests/plots.test.mjs.
//
// A building stands on a rectangular plot the size of its design (owner, 2026-11-16: lot sizes dropped; the old
// square S/M/L plots remain only for the placeholder boxes). Local coordinates: lx 0..w-1 left to right,
// lz 0..d-1 back to front (lz = d-1 is the entrance side), ly 0 = ground level of the plot. `rot` says which way the entrance faces:
// 0 = south (+z), 1 = west (-x), 2 = north (-z), 3 = east (+x).

import type { Plot } from "./buildings.js";
import type { Tier } from "./types.js";

export type Rot = 0 | 1 | 2 | 3;

/** Plot widths of the placeholder boxes (buildings without an imported design, e.g. the Defence section). */
export const PLOT_WIDTH: Record<Exclude<Plot, "perimeter">, number> = { S: 9, M: 13, L: 17 };

/** Placeholder building heights per level (M2a boxes). Room above is checked for the level-3 height. */
export const PLACEHOLDER_HEIGHT: Record<Exclude<Plot, "perimeter">, [number, number, number]> = {
  S: [5, 7, 9],
  M: [6, 9, 12],
  L: [7, 10, 13],
};

/**
 * Town border radius around the bell (horizontal blocks). The same for every tier (owner, 2026-11-15:
 * "always the biggest one"). Kept per tier so growth can come back without changing callers.
 */
export const BORDER = 160;
export const BORDER_RADIUS: Record<Tier, number> = { village: BORDER, town: BORDER, city: BORDER };

/** Ground may be cut this many blocks into a slope, and filled this many blocks under a building. */
export const CUT_MAX = 4;
export const FILL_MAX = 8;

/** One in-game day, split into 4 visible phases. */
export const BUILD_TICKS = 24000;
export const PHASES = 4;
/**
 * Steps: 0 = prepare the site + phase 1 (at once), 1 = phase 2 (1/3 day), 2 = phase 3 (2/3 day),
 * 3 = phase 4 + finish (full day). The last phase arrives with completion, so a building that looks
 * finished is finished (play-test 2026-11-15).
 */
export const STEPS = PHASES;

export interface Footprint {
  x: number; // min corner in the world
  z: number;
  /** Width along the entrance side (local x). */
  w: number;
  /** Depth from the back to the entrance (local z). */
  d: number;
  rot: Rot;
}

/** Size of the footprint along world x and z (width and depth swap when the entrance faces west or east). */
export const extent = (f: Pick<Footprint, "w" | "d" | "rot">): { wx: number; wz: number } => (f.rot % 2 === 0 ? { wx: f.w, wz: f.d } : { wx: f.d, wz: f.w });

/** Local plot position -> world x/z offset for a rotation. */
export function toWorld(f: Footprint, lx: number, lz: number): { x: number; z: number } {
  const mw = f.w - 1;
  const md = f.d - 1;
  switch (f.rot) {
    case 0: return { x: f.x + lx, z: f.z + lz };
    case 1: return { x: f.x + (md - lz), z: f.z + lx };
    case 2: return { x: f.x + (mw - lx), z: f.z + (md - lz) };
    default: return { x: f.x + lz, z: f.z + (mw - lx) };
  }
}

/** Cardinal facing of a view direction: 0 south, 1 west, 2 north, 3 east (same order as Rot). */
export function facingOf(dx: number, dz: number): Rot {
  if (Math.abs(dz) >= Math.abs(dx)) return dz >= 0 ? 0 : 2;
  return dx >= 0 ? 3 : 1;
}

const STEP: Record<Rot, [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };

/**
 * Footprint in front of a player: the plot sits a few blocks ahead, and its entrance faces back toward the
 * player (owner decision, 2026-11-15), turned by `extraTurns` quarter turns after pressing Rotate.
 */
export function footprintInFront(px: number, pz: number, dx: number, dz: number, w: number, d: number, extraTurns: number): Footprint {
  const facing = facingOf(dx, dz);
  const [sx, sz] = STEP[facing];
  const towardPlayer = ((facing + 2) % 4) as Rot;
  const rot = ((towardPlayer + extraTurns) % 4) as Rot;
  const { wx, wz } = extent({ w, d, rot });
  // The plot's near edge stays 3 blocks ahead of the player, whatever its size along the view.
  const dist = Math.floor((sx !== 0 ? wx : wz) / 2) + 3;
  const cx = Math.floor(px) + sx * dist;
  const cz = Math.floor(pz) + sz * dist;
  return { x: cx - Math.floor(wx / 2), z: cz - Math.floor(wz / 2), w, d, rot };
}

/** A quarter turn about the plot's centre (width and depth swap in the world, so the corner moves). */
export function turn(f: Footprint): Footprint {
  const before = extent(f);
  const rot = ((f.rot + 1) % 4) as Rot;
  const after = extent({ ...f, rot });
  const cx = f.x + Math.floor(before.wx / 2);
  const cz = f.z + Math.floor(before.wz / 2);
  return { ...f, rot, x: cx - Math.floor(after.wx / 2), z: cz - Math.floor(after.wz / 2) };
}

/** The footprint as a world rectangle. */
export const rectOf = (f: Footprint): Rect => ({ x: f.x, z: f.z, ...extent(f) });

/** Do two footprints overlap (or touch, with `gap` blocks of clearance)? */
export function overlaps(a: Footprint, b: Footprint, gap = 1): boolean {
  const ea = extent(a);
  const eb = extent(b);
  return a.x < b.x + eb.wx + gap && b.x < a.x + ea.wx + gap && a.z < b.z + eb.wz + gap && b.z < a.z + ea.wz + gap;
}

/** A non-square area (vanilla structures): min corner and size along x and z. */
export interface Rect {
  x: number;
  z: number;
  wx: number;
  wz: number;
  /** Lowest block and height, when known (vanilla structures), for drawing them as boxes. */
  y?: number;
  h?: number;
}

export function rectOverlaps(f: Footprint, r: Rect): boolean {
  const { wx, wz } = extent(f);
  return f.x < r.x + r.wx && r.x < f.x + wx && f.z < r.z + r.wz && r.z < f.z + wz;
}
export const rectContains = (r: Rect, x: number, z: number) => x >= r.x && x < r.x + r.wx && z >= r.z && z < r.z + r.wz;

/** Is the whole footprint inside the town border around the bell? */
export function insideBorder(f: Footprint, bellX: number, bellZ: number, radius: number): boolean {
  const { wx, wz } = extent(f);
  const corners = [[f.x, f.z], [f.x + wx, f.z], [f.x, f.z + wz], [f.x + wx, f.z + wz]];
  return corners.every(([x, z]) => (x - bellX - 0.5) ** 2 + (z - bellZ - 0.5) ** 2 <= radius * radius);
}

/** Does the footprint contain this block column? */
export function containsColumn(f: Footprint, x: number, z: number): boolean {
  const { wx, wz } = extent(f);
  return x >= f.x && x < f.x + wx && z >= f.z && z < f.z + wz;
}

/** Construction steps that should be done `elapsed` ticks after the start (1..STEPS). */
export function stepsDue(elapsed: number): number {
  if (elapsed >= BUILD_TICKS) return STEPS;
  return Math.min(STEPS - 1, 1 + Math.floor(Math.max(0, elapsed) / (BUILD_TICKS / (STEPS - 1))));
}

/** Ticks between visible steps (for the developer "next phase" command). */
export const STEP_TICKS = BUILD_TICKS / (STEPS - 1);

/** Layers (ly from, to exclusive) placed in phase 1..PHASES of a building `height` blocks tall. */
export function phaseLayers(phase: number, height: number): [number, number] {
  const from = Math.floor(((phase - 1) * height) / PHASES);
  const to = Math.floor((phase * height) / PHASES);
  return [from, to];
}

/** Real minutes left (20 ticks a second), rounded up. */
export const minutesLeft = (elapsed: number) => Math.max(0, Math.ceil((BUILD_TICKS - elapsed) / 1200));

/**
 * The whole border circle as points, about `spacing` blocks apart (block-centre coordinates around the bell).
 * Drawn as line segments between neighbours, so it is visible from anywhere inside the town (owner, 2026-11-17).
 */
export function borderRing(bellX: number, bellZ: number, radius: number, spacing: number): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  const steps = Math.max(8, Math.round((2 * Math.PI * radius) / spacing));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push({ x: bellX + 0.5 + Math.cos(a) * radius, z: bellZ + 0.5 + Math.sin(a) * radius });
  }
  return pts;
}
