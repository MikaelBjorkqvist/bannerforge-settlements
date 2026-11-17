// Solid guide lines in the world (owner, 2026-11-17: "like the lines in World Builder" instead of dotted particles).
// Each segment is ONE particle (RP/particles/line.particle.json): a thin strip stretched between two points that
// turns around its own axis to face the camera. In `lookat_direction` the billboard's X axis follows the direction,
// so the length is the first size value (verified in game 2026-11-17). The direction mode is "custom" as in vanilla shriek.json; the
// documented "custom_direction" is silently ignored and every strip spins at random (play-test 2026-11-17). A plot edge of 9 blocks is 1 particle instead of 9 dots, so the
// lines can be redrawn often (no trailing while you walk) and the whole town border fits in the budget.

import { type Dimension, MolangVariableMap, type Vector3 } from "@minecraft/server";

const LINE = "bannerforge_settlements:line";

export type RGB = { red: number; green: number; blue: number };

export interface LineStyle {
  color: RGB;
  /** Strip width in blocks. */
  thick: number;
  /** Seconds the segment stays: a little longer than the redraw interval, so lines never blink. */
  life: number;
}

/** One straight segment from a to b. Silently skipped outside loaded chunks. */
export function line(dim: Dimension, a: Vector3, b: Vector3, style: LineStyle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return;
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", style.color);
  vars.setVector3("variable.dir", { x: dx / len, y: dy / len, z: dz / len });
  vars.setFloat("variable.len", len);
  vars.setFloat("variable.thick", style.thick);
  vars.setFloat("variable.life", style.life);
  try {
    dim.spawnParticle(LINE, { x: a.x + dx / 2, y: a.y + dy / 2, z: a.z + dz / 2 }, vars);
  } catch {
    // outside loaded chunks
  }
}

/** A flat rectangle at height y, corners (x0, z0) and (x1, z1) on block edges. */
export function rect(dim: Dimension, x0: number, z0: number, x1: number, z1: number, y: number, style: LineStyle): void {
  line(dim, { x: x0, y, z: z0 }, { x: x1, y, z: z0 }, style);
  line(dim, { x: x1, y, z: z0 }, { x: x1, y, z: z1 }, style);
  line(dim, { x: x1, y, z: z1 }, { x: x0, y, z: z1 }, style);
  line(dim, { x: x0, y, z: z1 }, { x: x0, y, z: z0 }, style);
}

/** A wireframe box: bottom and top rectangles and the four corner posts. */
export function box(dim: Dimension, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, style: LineStyle): void {
  rect(dim, x0, z0, x1, z1, y0, style);
  rect(dim, x0, z0, x1, z1, y1, style);
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) line(dim, { x, y: y0, z }, { x, y: y1, z }, style);
}

const WALL = "bannerforge_settlements:border_wall";

/**
 * One upright, see-through striped panel (RP/particles/border_wall.particle.json), fixed in the world like the
 * vanilla world border: `along` is the horizontal direction of the wall (x or z), the panel stands upright.
 */
export function wallPanel(dim: Dimension, center: Vector3, along: { x: number; z: number }, w: number, h: number, color: RGB, life: number): void {
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", color);
  vars.setVector3("variable.dir", { x: along.x, y: 0, z: along.z });
  vars.setFloat("variable.w", w);
  vars.setFloat("variable.h", h);
  vars.setFloat("variable.life", life);
  try {
    dim.spawnParticle(WALL, center, vars);
  } catch {
    // outside loaded chunks
  }
}
