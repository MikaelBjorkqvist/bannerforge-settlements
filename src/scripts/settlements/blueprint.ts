// What a building looks like, block by block, in plot-local coordinates (see plots.ts).
// Designed buildings come from the structure pipeline (docs/STRUCTURES.md, generated/blueprints.ts);
// buildings without a design yet (or for a faction without one) use the M2a placeholder boxes.

import { ALPHABET, type BlueprintData } from "./blueprint_data.js";
import type { BuildingDef, Category } from "./buildings.js";
import { BLUEPRINTS, VARIANTS } from "./generated/blueprints.js";
import { PLACEHOLDER_HEIGHT, type Rot } from "./plots.js";
import { rotateStates } from "./rotate.js";

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
      if (ly === 1 && lz === w - 1 && lx === mid + 2) return { id: "minecraft:standing_sign", states: { ground_sign_direction: SIGN_DIR[rot] }, sign: true };
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

// ---------- designed buildings ----------

const key = (faction: string, building: string, variant: string, level: number) => `${faction}/${building}/${variant}/${level}`;

/** Variants designed for a building in a faction's style (empty = placeholder). */
export const variantsFor = (faction: string, building: string): string[] => VARIANTS[`${faction}/${building}`] ?? [];

/** A random variant, so a village doesn't fill up with copies of one house. */
export function pickVariant(faction: string, building: string): string | undefined {
  const list = variantsFor(faction, building);
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function dataBlueprint(data: BlueprintData, rot: Rot): Blueprint {
  const [w, height] = data.size;
  const turned = data.palette.map((p) => ({ id: p.id, states: rotateStates(p.id, p.states, rot) }));
  return {
    w,
    height,
    at(lx, ly, lz) {
      const ch = data.layers[ly]?.[lz]?.[lx];
      if (!ch || ch === ".") return undefined;
      return turned[ALPHABET.indexOf(ch)];
    },
  };
}

/** The blueprint to build: the designed one if it exists for this faction, plot width and variant, else a placeholder. */
export function blueprintFor(def: BuildingDef, faction: string, variant: string | undefined, level: 1 | 2 | 3, w: number, rot: Rot): Blueprint {
  const data = variant ? BLUEPRINTS[key(faction, def.id, variant, level)] : undefined;
  if (data && data.size[0] === w && data.size[2] === w) return dataBlueprint(data, rot);
  if (data) console.warn(`[BannerForge] design ${key(faction, def.id, variant!, level)} is ${data.size[0]}x${data.size[2]}, plot is ${w}x${w}: placeholder used`);
  return placeholderBlueprint(def, level, w, rot);
}

/** Height of the tallest level, for checking room above and protecting the site. */
export function topHeightFor(def: BuildingDef, faction: string, variant: string | undefined): number {
  const plot = def.plot === "perimeter" ? "S" : def.plot;
  const designed = variant ? [1, 2, 3].map((l) => BLUEPRINTS[key(faction, def.id, variant, l)]?.size[1] ?? 0) : [];
  return Math.max(PLACEHOLDER_HEIGHT[plot][2], ...designed);
}

/** Any designed blueprint by its full key (developer preview command). */
export function blueprintByKey(k: string, rot: Rot): Blueprint | undefined {
  const data = BLUEPRINTS[k];
  return data ? dataBlueprint(data, rot) : undefined;
}

export const blueprintKeys = (): string[] => Object.keys(BLUEPRINTS);
