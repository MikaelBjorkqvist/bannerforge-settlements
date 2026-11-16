// Plot geometry and construction timing. Pure functions (no game imports), unit-tested in tests/plots.test.mjs.
//
// A building stands on a square plot. Local coordinates: lx 0..w-1 left to right, lz 0..w-1 back to front
// (lz = w-1 is the entrance side), ly 0 = ground level of the plot. `rot` says which way the entrance faces:
// 0 = south (+z), 1 = west (-x), 2 = north (-z), 3 = east (+x).

import type { Plot } from "./buildings.js";
import type { Tier } from "./types.js";

export type Rot = 0 | 1 | 2 | 3;

/** Plot widths (docs/BUILDINGS.md rule 7). Width and depth never change; only height grows. */
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
  x: number; // min corner
  z: number;
  w: number;
  rot: Rot;
}

/** Local plot position -> world x/z offset for a rotation. */
export function toWorld(f: Footprint, lx: number, lz: number): { x: number; z: number } {
  const m = f.w - 1;
  switch (f.rot) {
    case 0: return { x: f.x + lx, z: f.z + lz };
    case 1: return { x: f.x + (m - lz), z: f.z + lx };
    case 2: return { x: f.x + (m - lx), z: f.z + (m - lz) };
    default: return { x: f.x + lz, z: f.z + (m - lx) };
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
export function footprintInFront(px: number, pz: number, dx: number, dz: number, w: number, extraTurns: number): Footprint {
  const facing = facingOf(dx, dz);
  const [sx, sz] = STEP[facing];
  const dist = Math.floor(w / 2) + 3;
  const cx = Math.floor(px) + sx * dist;
  const cz = Math.floor(pz) + sz * dist;
  const towardPlayer = ((facing + 2) % 4) as Rot;
  return { x: cx - Math.floor(w / 2), z: cz - Math.floor(w / 2), w, rot: ((towardPlayer + extraTurns) % 4) as Rot };
}

export const turn = (f: Footprint): Footprint => ({ ...f, rot: ((f.rot + 1) % 4) as Rot });

/** Do two footprints overlap (or touch, with `gap` blocks of clearance)? */
export function overlaps(a: Footprint, b: Footprint, gap = 1): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.z < b.z + b.w + gap && b.z < a.z + a.w + gap;
}

/** A non-square area (vanilla structures): min corner and size along x and z. */
export interface Rect {
  x: number;
  z: number;
  wx: number;
  wz: number;
}

export const rectOverlaps = (f: Footprint, r: Rect) => f.x < r.x + r.wx && r.x < f.x + f.w && f.z < r.z + r.wz && r.z < f.z + f.w;
export const rectContains = (r: Rect, x: number, z: number) => x >= r.x && x < r.x + r.wx && z >= r.z && z < r.z + r.wz;

/** Is the whole footprint inside the town border around the bell? */
export function insideBorder(f: Footprint, bellX: number, bellZ: number, radius: number): boolean {
  const corners = [[f.x, f.z], [f.x + f.w, f.z], [f.x, f.z + f.w], [f.x + f.w, f.z + f.w]];
  return corners.every(([x, z]) => (x - bellX - 0.5) ** 2 + (z - bellZ - 0.5) ** 2 <= radius * radius);
}

/** Does the footprint contain this block column? */
export const containsColumn = (f: Footprint, x: number, z: number) => x >= f.x && x < f.x + f.w && z >= f.z && z < f.z + f.w;

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

/** Points along the border circle within `near` blocks of (px, pz), every `spacing` blocks. */
export function borderPointsNear(bellX: number, bellZ: number, radius: number, px: number, pz: number, near: number, spacing: number): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  const steps = Math.max(8, Math.round((2 * Math.PI * radius) / spacing));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const x = bellX + 0.5 + Math.cos(a) * radius;
    const z = bellZ + 0.5 + Math.sin(a) * radius;
    if ((x - px) ** 2 + (z - pz) ** 2 <= near * near) pts.push({ x, z });
  }
  return pts;
}
