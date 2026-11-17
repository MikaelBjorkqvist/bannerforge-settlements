// The town border as one continuous line on the ground, all the way round (owner, 2026-11-17: "visible always
// when building, also from afar, the whole border"). It follows the terrain: ground heights along the ring are
// read a few at a time and remembered, so a redraw only spawns particles. Lines get thicker with distance so the
// far side of the town still reads as a line instead of vanishing.

import type { Player } from "@minecraft/server";
import { line, type RGB } from "./lines.js";
import { BORDER_RADIUS, borderRing } from "./plots.js";
import { tier } from "./rules.js";
import { readColumn } from "./terrain.js";
import type { Settlement } from "./types.js";

const GOLD: RGB = { red: 1, green: 0.82, blue: 0.15 };
/** Blocks between ring points (a 160 radius ring has about 200 segments). */
const SPACING = 5;
/** A short post every this many ring points, so the border shows above grass and over small hills. */
const POST_EVERY = 5;
const POST_HEIGHT = 2.5;
/** Ground readings per redraw: unknown points first, then a slow refresh of the rest (terrain changes). */
const NEW_READS = 10;
const REFRESH_READS = 2;

interface Ring {
  key: string;
  pts: { x: number; z: number }[];
  ys: (number | undefined)[];
  next: number;
  /** Where the search for unread points continues (unloaded points don't block the rest). */
  scan: number;
}

const rings = new Map<string, Ring>();

function ringFor(s: Settlement): Ring {
  const r = BORDER_RADIUS[tier(s)];
  const key = `${s.center.x},${s.center.z},${r}`;
  let ring = rings.get(s.id);
  if (!ring || ring.key !== key) {
    const pts = borderRing(s.center.x, s.center.z, r, SPACING);
    ring = { key, pts, ys: pts.map(() => undefined), next: 0, scan: 0 };
    rings.set(s.id, ring);
  }
  return ring;
}

function readGround(player: Player, s: Settlement, ring: Ring): void {
  const dim = player.dimension;
  const floor = s.center.y - 48;
  const read = (i: number) => {
    const p = ring.pts[i];
    const c = readColumn(dim, Math.floor(p.x), Math.floor(p.z), floor);
    if (c) ring.ys[i] = c.ground + 1; // top surface of the ground block
  };
  const n = ring.pts.length;
  let fresh = 0;
  for (let k = 0; k < n && fresh < NEW_READS; k++) {
    const i = (ring.scan + k) % n;
    if (ring.ys[i] !== undefined) continue;
    read(i);
    fresh++;
    ring.scan = (i + 1) % n;
  }
  for (let k = 0; k < REFRESH_READS; k++) {
    read(ring.next);
    ring.next = (ring.next + 1) % ring.pts.length;
  }
}

/** Height for a ring point: its own reading, else the nearest known neighbour, else the bell. */
function heightAt(ring: Ring, i: number, fallback: number): number {
  const n = ring.pts.length;
  for (let k = 0; k < n / 2; k++) {
    const a = ring.ys[(i + k) % n];
    if (a !== undefined) return a;
    const b = ring.ys[(i - k + n) % n];
    if (b !== undefined) return b;
  }
  return fallback;
}

/**
 * Particles far from the player are never shown (play-test 2026-11-17: the border 160 blocks out was invisible).
 * A segment further away than this is drawn closer, along the line of sight, scaled down by the same factor, so
 * on screen it is exactly where and as big as the real border. It also shows through hills and trees.
 */
const NEAR = 40;

/**
 * Draws the whole border once. `life` = seconds the lines stay (redraw a little sooner than that).
 */
export function drawBorder(player: Player, s: Settlement, life: number): void {
  const ring = ringFor(s);
  readGround(player, s, ring);
  const dim = player.dimension;
  const eye = player.getHeadLocation();
  const n = ring.pts.length;
  const ys = ring.pts.map((_, i) => heightAt(ring, i, s.center.y + 1) + 0.08);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = { x: ring.pts[i].x, y: ys[i], z: ring.pts[i].z };
    const b = { x: ring.pts[j].x, y: ys[j], z: ring.pts[j].z };
    const top = { x: a.x, y: a.y + POST_HEIGHT, z: a.z };
    const dist = Math.hypot((a.x + b.x) / 2 - eye.x, (a.y + b.y) / 2 - eye.y, (a.z + b.z) / 2 - eye.z);
    // About 1.5 pixels wide at any distance on a normal screen.
    const thick = Math.min(1.4, 0.07 + dist * 0.0045);
    const k = dist > NEAR ? NEAR / dist : 1;
    const pull = (p: { x: number; y: number; z: number }) => (k === 1 ? p : { x: eye.x + (p.x - eye.x) * k, y: eye.y + (p.y - eye.y) * k, z: eye.z + (p.z - eye.z) * k });
    const style = { color: GOLD, thick: thick * k, life };
    line(dim, pull(a), pull(b), style);
    if (i % POST_EVERY === 0) line(dim, pull(a), pull(top), style);
  }
}
