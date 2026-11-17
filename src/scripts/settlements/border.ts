// The town border: a square around the bell, shown like the vanilla world border (owner, 2026-11-17: square for
// defences later; "quite static and visible when building"; "a little bit like the world boundary").
//
// - Near the player: a see-through striped wall, panels fixed in the world on a grid anchored to the bell, so
//   nothing slides around while you walk. Fixed height band around the bell's height (plus the rows at the
//   player's own height if they stand far above or below it).
// - The whole square: a gold line along the top of the wall, with corner posts. Particles far from the player are
//   never shown, so parts further than FAR are drawn closer along the line of sight and scaled by the same factor
//   (same place and size on screen). Those are redrawn every 2 ticks so they keep up with the player.

import type { Player, Vector3 } from "@minecraft/server";
import { line, wallPanel, type RGB } from "./lines.js";
import { BORDER_RADIUS, townSquare } from "./plots.js";
import { tier } from "./rules.js";
import type { Settlement } from "./types.js";

const GOLD: RGB = { red: 1, green: 0.8, blue: 0.2 };
/** Wall panels: blocks wide and high. The grid starts at the square's corners and below the bell. */
const PANEL = 8;
/** The band of wall around the bell's height: from 1 panel below to 3 panels above. */
const BAND_BELOW = 1;
const BAND_ABOVE = 3;
/** Wall panels are drawn within this many blocks of the player. */
const WALL_NEAR = 48;
/** The outline is split in pieces this long; pieces further away than FAR are drawn closer to the player. */
const PIECE = 16;
const FAR = 56;

interface Edge {
  a: { x: number; z: number };
  b: { x: number; z: number };
  along: { x: number; z: number };
}

function edgesOf(s: Settlement): Edge[] {
  const q = townSquare(s.center.x, s.center.z, BORDER_RADIUS[tier(s)]);
  return [
    { a: { x: q.x0, z: q.z0 }, b: { x: q.x1, z: q.z0 }, along: { x: 1, z: 0 } },
    { a: { x: q.x1, z: q.z0 }, b: { x: q.x1, z: q.z1 }, along: { x: 0, z: 1 } },
    { a: { x: q.x1, z: q.z1 }, b: { x: q.x0, z: q.z1 }, along: { x: -1, z: 0 } },
    { a: { x: q.x0, z: q.z1 }, b: { x: q.x0, z: q.z0 }, along: { x: 0, z: -1 } },
  ];
}

const bottomOf = (s: Settlement) => s.center.y - BAND_BELOW * PANEL;
const topOf = (s: Settlement) => s.center.y + BAND_ABOVE * PANEL;

/** Distance from a point to the nearest point of an edge, horizontally. */
function edgeDistance(e: Edge, x: number, z: number): number {
  const len = Math.abs(e.b.x - e.a.x) + Math.abs(e.b.z - e.a.z);
  const t = Math.max(0, Math.min(len, (x - e.a.x) * e.along.x + (z - e.a.z) * e.along.z));
  return Math.hypot(e.a.x + e.along.x * t - x, e.a.z + e.along.z * t - z);
}

/**
 * Static parts, every 10 ticks: wall panels near the player and outline pieces within FAR (at their real place).
 */
export function drawBorderNear(player: Player, s: Settlement, life: number): void {
  const dim = player.dimension;
  const px = player.location.x;
  const py = player.location.y;
  const pz = player.location.z;
  const bottom = bottomOf(s);
  const top = topOf(s);
  // Rows of panels: the band, and the rows within 16 blocks of the player's height, on the same grid.
  const rows = new Set<number>();
  for (let y = bottom; y < top; y += PANEL) rows.add(y);
  const r0 = bottom + Math.floor((py - 16 - bottom) / PANEL) * PANEL;
  for (let y = r0; y < py + 16; y += PANEL) rows.add(y);

  for (const e of edgesOf(s)) {
    if (edgeDistance(e, px, pz) > WALL_NEAR) continue;
    const len = Math.abs(e.b.x - e.a.x) + Math.abs(e.b.z - e.a.z);
    for (let t = 0; t < len; t += PANEL) {
      const w = Math.min(PANEL, len - t);
      const cx = e.a.x + e.along.x * (t + w / 2);
      const cz = e.a.z + e.along.z * (t + w / 2);
      if (Math.hypot(cx - px, cz - pz) > WALL_NEAR) continue;
      for (const y of rows) wallPanel(dim, { x: cx, y: y + PANEL / 2, z: cz }, e.along, w, PANEL, GOLD, life);
    }
  }
  outline(player, s, life, false);
}

/** Moving parts, every 2 ticks: outline pieces further than FAR, drawn closer to the player. */
export function drawBorderFar(player: Player, s: Settlement, life: number): void {
  outline(player, s, life, true);
}

function outline(player: Player, s: Settlement, life: number, far: boolean): void {
  const dim = player.dimension;
  const eye = player.getHeadLocation();
  const top = topOf(s);
  const bottom = bottomOf(s);
  const draw = (a: Vector3, b: Vector3) => {
    const dist = Math.hypot((a.x + b.x) / 2 - eye.x, (a.y + b.y) / 2 - eye.y, (a.z + b.z) / 2 - eye.z);
    if (dist > FAR !== far) return;
    // About 2 pixels wide at any distance on a normal screen.
    const thick = Math.min(2, 0.1 + dist * 0.005);
    const k = far ? FAR / dist : 1;
    const pull = (p: Vector3) => (k === 1 ? p : { x: eye.x + (p.x - eye.x) * k, y: eye.y + (p.y - eye.y) * k, z: eye.z + (p.z - eye.z) * k });
    line(dim, pull(a), pull(b), { color: GOLD, thick: thick * k, life });
  };
  for (const e of edgesOf(s)) {
    const len = Math.abs(e.b.x - e.a.x) + Math.abs(e.b.z - e.a.z);
    for (let t = 0; t < len; t += PIECE) {
      const t1 = Math.min(len, t + PIECE);
      draw({ x: e.a.x + e.along.x * t, y: top, z: e.a.z + e.along.z * t }, { x: e.a.x + e.along.x * t1, y: top, z: e.a.z + e.along.z * t1 });
    }
    // Corner post, in pieces so the near part stays put.
    for (let y = bottom; y < top; y += PIECE) draw({ x: e.a.x, y, z: e.a.z }, { x: e.a.x, y: Math.min(top, y + PIECE), z: e.a.z });
  }
}
