// What a building looks like, block by block, in plot-local coordinates (see plots.ts).
// M2a: placeholder boxes. M2b replaces these with real designs (.mcstructure files) behind the same interface.

import type { BuildingDef, Category } from "./buildings.js";
import { PLACEHOLDER_HEIGHT, type Rot } from "./plots.js";

export interface BlockSpec {
  id: string;
  states?: Record<string, string | number | boolean>;
  /** A sign to write the building's name on. */
  sign?: boolean;
}

export interface Blueprint {
  w: number;
  height: number;
  /** Block at a local position, or undefined for air. */
  at(lx: number, ly: number, lz: number): BlockSpec | undefined;
}

/** Placeholder wall colour per ledger section, so boxes are easy to tell apart in play-tests. */
const WALL: Record<Category, string> = {
  centre: "minecraft:yellow_concrete",
  population: "minecraft:light_blue_concrete",
  trade: "minecraft:orange_concrete",
  food: "minecraft:lime_concrete",
  defence: "minecraft:gray_concrete",
};

/** Sign facing the entrance side (ground_sign_direction: 0 south, 4 west, 8 north, 12 east). */
const SIGN_DIR: Record<Rot, number> = { 0: 0, 1: 4, 2: 8, 3: 12 };

export function placeholderBlueprint(def: BuildingDef, level: 1 | 2 | 3, w: number, rot: Rot): Blueprint {
  const plot = def.plot === "perimeter" ? "S" : def.plot;
  const height = PLACEHOLDER_HEIGHT[plot][level - 1];
  const wall = WALL[def.category];
  const mid = Math.floor(w / 2);
  const lo = 1;
  const hi = w - 2; // walls stand one block in, leaving a garden ring around the building
  return {
    w,
    height,
    at(lx, ly, lz) {
      const inside = lx >= lo && lx <= hi && lz >= lo && lz <= hi;
      // Sign in the front garden, right of the door.
      if (ly === 1 && lz === w - 1 && lx === mid + 2) return { id: "minecraft:oak_standing_sign", states: { ground_sign_direction: SIGN_DIR[rot] }, sign: true };
      if (!inside) return undefined;
      if (ly === 0) return { id: "minecraft:oak_planks" };
      if (ly === height - 1) return { id: "minecraft:smooth_stone_slab" };
      const edgeX = lx === lo || lx === hi;
      const edgeZ = lz === lo || lz === hi;
      if (!edgeX && !edgeZ) return undefined;
      if (edgeX && edgeZ) return { id: "minecraft:stone_bricks" };
      // Door gap in the front wall, windows every third block on the second row.
      if (lz === hi && lx === mid && (ly === 1 || ly === 2)) return undefined;
      if (ly % 4 === 2 && (edgeX ? lz : lx) % 3 === 0) return { id: "minecraft:glass" };
      // A darker band marks each level, so levels are visible on the placeholder.
      if (ly % 4 === 0) return { id: "minecraft:stone_bricks" };
      return { id: wall };
    },
  };
}
