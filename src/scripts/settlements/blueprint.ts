// What a building looks like, block by block, in plot-local coordinates (see plots.ts).
// Designed buildings come from the structure pipeline (docs/STRUCTURES.md, generated/blueprints.ts);
// buildings without a design yet (or for a faction without one) use the M2a placeholder boxes.

import { ALPHABET, type BlueprintData } from "./blueprint_data.js";
import type { BuildingDef, Category } from "./buildings.js";
import { BLUEPRINTS, VARIANTS } from "./generated/blueprints.js";
import { IMPORTED, PLACEHOLDER_DESIGN, type ImportedDesign } from "./generated/imported.js";
import { PLACEHOLDER_HEIGHT, PLOT_WIDTH, type Rot } from "./plots.js";
import { rotateStates } from "./rotate.js";

export interface BlockSpec {
  id: string;
  states?: Record<string, string | number | boolean>;
  /** A sign to write the building's name on. */
  sign?: boolean;
}

export interface Blueprint {
  /** Width (local x) and depth (local z, entrance at d - 1). */
  w: number;
  d: number;
  height: number;
  /** Block at a local position, or undefined for air. */
  at(lx: number, ly: number, lz: number): BlockSpec | undefined;
  /**
   * Imported designs: the structure placed when the building is finished (it keeps bed colours, cushions and
   * container contents, which scripts can't set). `turns` = clockwise quarter turns to apply when placing.
   */
  structure?: { id: string; turns: number; yOffset: number };
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
    d: w,
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

/**
 * Variants designed for a building in a faction's style (empty = placeholder). The generated designs
 * (generated/blueprints.ts) are switched off while the owner's hand-built placeholder exists: owner decision
 * 2026-11-16, generated houses dropped, the owner's house stands in for every building.
 */
export const variantsFor = (faction: string, building: string): string[] => (PLACEHOLDER_DESIGN ? [] : VARIANTS[`${faction}/${building}`] ?? []);

/** A random variant, so a village doesn't fill up with copies of one house. */
export function pickVariant(faction: string, building: string): string | undefined {
  const list = variantsFor(faction, building);
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function dataBlueprint(data: BlueprintData, rot: Rot): Blueprint {
  const [w, height, d] = data.size;
  const turned = data.palette.map((p) => ({ id: p.id, states: rotateStates(p.id, p.states, rot), sign: p.sign }));
  return {
    w,
    d,
    height,
    at(lx, ly, lz) {
      const ch = data.layers[ly]?.[lz]?.[lx];
      if (!ch || ch === ".") return undefined;
      return turned[ALPHABET.indexOf(ch)];
    },
  };
}

// ---------- imported designs (owner-built, tools/import_structures.mjs) ----------

function importedBlueprint(imp: ImportedDesign, rot: Rot): Blueprint {
  return { ...dataBlueprint(imp.data, rot), structure: { id: imp.structure, turns: (rot + imp.turns) % 4, yOffset: imp.yOffset } };
}

/**
 * The owner's placeholder design for this building and faction (owner, 2026-11-16: one hand-built house stands
 * in for every building until it has its own design; the Defence section keeps its boxes).
 */
function importedPlaceholder(def: BuildingDef, faction: string): ImportedDesign | undefined {
  if (!PLACEHOLDER_DESIGN || def.category === "defence" || def.plot === "perimeter") return undefined;
  return IMPORTED[`${PLACEHOLDER_DESIGN}/${faction}`];
}

/**
 * Plot size (width, depth) of a building: as big as its design (owner, 2026-11-16: lot sizes dropped).
 * Buildings without a design (the Defence section) keep the square placeholder plot.
 */
export function plotSizeFor(def: BuildingDef, faction: string, variant: string | undefined): { w: number; d: number } {
  const data = variant ? BLUEPRINTS[key(faction, def.id, variant, 1)] : undefined;
  if (data) return { w: data.size[0], d: data.size[2] };
  const imp = importedPlaceholder(def, faction);
  if (imp) return { w: imp.data.size[0], d: imp.data.size[2] };
  const w = PLOT_WIDTH[def.plot === "perimeter" ? "S" : def.plot];
  return { w, d: w };
}

/**
 * The blueprint to build on a w x d plot: the designed one if it exists for this faction and variant and fits;
 * else the owner's imported placeholder house if it fits; else a placeholder box.
 */
export function blueprintFor(def: BuildingDef, faction: string, variant: string | undefined, level: 1 | 2 | 3, w: number, d: number, rot: Rot): Blueprint {
  const data = variant ? BLUEPRINTS[key(faction, def.id, variant, level)] : undefined;
  if (data && data.size[0] === w && data.size[2] === d) return dataBlueprint(data, rot);
  if (data) console.warn(`[BannerForge] design ${key(faction, def.id, variant!, level)} is ${data.size[0]}x${data.size[2]}, plot is ${w}x${d}: placeholder used`);
  const imp = importedPlaceholder(def, faction);
  if (imp && imp.data.size[0] === w && imp.data.size[2] === d) return importedBlueprint(imp, rot);
  // Sites placed before 2026-11-17 have the old square plots: they keep a box.
  return placeholderBlueprint(def, level, Math.min(w, d), rot);
}

/** Height of the tallest level, for checking room above and protecting the site. */
export function topHeightFor(def: BuildingDef, faction: string, variant: string | undefined): number {
  const designed = variant ? [1, 2, 3].map((l) => BLUEPRINTS[key(faction, def.id, variant, l)]?.size[1] ?? 0) : [];
  if (designed.some((h) => h > 0)) return Math.max(...designed);
  const imported = importedPlaceholder(def, faction);
  if (imported) return imported.data.size[1];
  return PLACEHOLDER_HEIGHT[def.plot === "perimeter" ? "S" : def.plot][2];
}

/** Any designed blueprint by its full key (developer preview command); imported ones as imported/<design>/<faction>. */
export function blueprintByKey(k: string, rot: Rot): Blueprint | undefined {
  if (k.startsWith("imported/")) {
    const imp = IMPORTED[k.slice("imported/".length)];
    return imp ? importedBlueprint(imp, rot) : undefined;
  }
  const data = BLUEPRINTS[k];
  return data ? dataBlueprint(data, rot) : undefined;
}

export const blueprintKeys = (): string[] => [...Object.keys(BLUEPRINTS), ...Object.keys(IMPORTED).map((k) => `imported/${k}`)];
