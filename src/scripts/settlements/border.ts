// The town border: a square around the bell, shown like the vanilla world border (owner, 2026-11-17: square for
// defences later; "quite static and visible when building"; "a little bit like the world boundary"; white, no
// flashing, the whole border, nothing that moves with the player).
//
// A wall of striped panels all the way round, fixed in the world on a grid anchored to the bell: a band from one
// panel below to three panels above the bell's height, plus the rows at the player's own height if they stand far
// above or below it. White stripes at 50% (owner, 2026-11-17); each panel fades in and out at the ends of its life
// so overlapping redraws crossfade instead of flashing.

import type { Player } from "@minecraft/server";
import { wallPanel, type RGB } from "./lines.js";
import { BORDER_RADIUS, townSquare } from "./plots.js";
import { tier } from "./rules.js";
import type { Settlement } from "./types.js";

const WHITE: RGB = { red: 1, green: 1, blue: 1 };
/** Wall panels: blocks wide and high. The grid starts at the square's corners and below the bell. */
const PANEL = 8;
const BAND_BELOW = 1;
const BAND_ABOVE = 3;

interface Edge {
  a: { x: number; z: number };
  along: { x: number; z: number };
  len: number;
}

function edgesOf(s: Settlement): Edge[] {
  const q = townSquare(s.center.x, s.center.z, BORDER_RADIUS[tier(s)]);
  const wx = q.x1 - q.x0;
  const wz = q.z1 - q.z0;
  return [
    { a: { x: q.x0, z: q.z0 }, along: { x: 1, z: 0 }, len: wx },
    { a: { x: q.x1, z: q.z0 }, along: { x: 0, z: 1 }, len: wz },
    { a: { x: q.x1, z: q.z1 }, along: { x: -1, z: 0 }, len: wx },
    { a: { x: q.x0, z: q.z1 }, along: { x: 0, z: -1 }, len: wz },
  ];
}

/** Draws the whole border once; `life` = seconds it stays (redraw a little sooner). */
export function drawBorder(player: Player, s: Settlement, life: number): void {
  const dim = player.dimension;
  const py = player.location.y;
  const bottom = s.center.y - BAND_BELOW * PANEL;
  const rows = new Set<number>();
  for (let y = bottom; y < s.center.y + BAND_ABOVE * PANEL; y += PANEL) rows.add(y);
  for (let y = bottom + Math.floor((py - 16 - bottom) / PANEL) * PANEL; y < py + 16; y += PANEL) rows.add(y);

  for (const e of edgesOf(s)) {
    for (let t = 0; t < e.len; t += PANEL) {
      const w = Math.min(PANEL, e.len - t);
      const cx = e.a.x + e.along.x * (t + w / 2);
      const cz = e.a.z + e.along.z * (t + w / 2);
      for (const y of rows) wallPanel(dim, { x: cx, y: y + PANEL / 2, z: cz }, e.along, w, PANEL, WHITE, life);
    }
  }
}
