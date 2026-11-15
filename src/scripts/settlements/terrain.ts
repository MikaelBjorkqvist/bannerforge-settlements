// Reading the land under a plot: ground level, slopes, water, village structures, room above.
// Used by placement (green / orange / red) and by construction (clearing and the foundation).

import type { Block, Dimension } from "@minecraft/server";
import { CUT_MAX, FILL_MAX, containsColumn, overlaps, rectOverlaps, toWorld, type Footprint, type Rect } from "./plots.js";

/** Plants, trees and snow: cleared freely when building. */
const CLEARABLE =
  /(leaves|_log$|_wood$|_stem$|_sapling$|_mushroom$|_tulip$|^minecraft:(short_grass|tall_grass|fern|large_fern|vine|snow_layer|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|sugar_cane|dead_bush|pink_petals|bamboo|cactus|sweet_berry_bush|moss_carpet|glow_lichen|hanging_roots|leaf_litter|bush|firefly_bush|short_dry_grass|tall_dry_grass|wildflowers|pumpkin|melon_block|bee_nest|cocoa|torchflower|pitcher_plant|azalea|flowering_azalea|mangrove_roots|muddy_mangrove_roots|spore_blossom|big_dripleaf|small_dripleaf_block|seagrass|kelp|web))/;

/**
 * Blocks of buildings and farms made by villagers or players. Rough on purpose: the stable Script API can't
 * tell us where a vanilla structure is, so we look for what it is made of. Paths count as ground.
 */
const MAN_MADE =
  /(planks|_door$|_bed$|glass|crafting_table|smithing_table|fletching_table|cartography_table|barrel|chest|composter|lectern|loom|stonecutter|grindstone|blast_furnace|smoker|furnace|cobblestone|stone_bricks|^minecraft:bricks|_fence|torch|lantern|_wool$|_carpet$|hay_block|_stairs$|_slab$|ladder|trapdoor|bookshelf|cauldron|brewing_stand|anvil|stripped_|cut_sandstone|smooth_sandstone|_concrete$|bell|farmland|^minecraft:(wheat|carrots|potatoes|beetroot)$)/;

/** Blocks that anchor a vanilla house (villager beds and workstations, doors). */
export const ANCHOR = /(_bed$|_door$|lectern|composter|smithing_table|fletching_table|cartography_table|loom|stonecutter|grindstone|blast_furnace|smoker|barrel|cauldron|brewing_stand)/;

const LIQUID = /water|lava/;

/**
 * Natural terrain: the only thing that counts as ground, and the only thing that blocks a building above
 * the ground (cliffs, overhangs). Anything else that isn't a plant is treated as a structure and cleared
 * (play-test 2026-11-15: unknown village blocks made "Not enough room above" too often).
 * Checked after MAN_MADE, so cobblestone, stone bricks and cut sandstone stay structures.
 */
const NATURAL =
  /(stone|dirt|deepslate|granite|diorite|andesite|tuff|calcite|sand|gravel|clay|terracotta|_ore$|grass_block|podzol|mycelium|mud|moss_block|snow$|powder_snow|ice$|basalt|blackstone|netherrack|nylium|soul_soil|soul_sand|bedrock|obsidian|magma|dripstone_block|amethyst_block|sculk|end_stone|path)/;

export const isAir = (id: string) => id === "minecraft:air" || id === "minecraft:cave_air" || id === "minecraft:light_block";
export const isClearable = (id: string) => isAir(id) || CLEARABLE.test(id);
export const isManMade = (id: string) => MAN_MADE.test(id);
export const isLiquid = (id: string) => LIQUID.test(id);
export const isNatural = (id: string) => !isManMade(id) && NATURAL.test(id);

export interface Column {
  x: number;
  z: number;
  /** y of the natural ground block (top of the terrain under plants, trees and buildings), or of the water. */
  ground: number;
  water: boolean;
  /** Village building or farm blocks were found in this column. */
  house: boolean;
}

/** Walks down a column from its topmost block, skipping plants, trees and man-made blocks. */
export function readColumn(dim: Dimension, x: number, z: number, floor: number): Column | undefined {
  let top: Block | undefined;
  try {
    top = dim.getTopmostBlock({ x, z });
  } catch {
    return undefined; // unloaded
  }
  if (!top) return undefined;
  let y = top.location.y;
  let house = false;
  for (let steps = 0; steps < 64 && y > floor; steps++, y--) {
    let id: string;
    try {
      id = dim.getBlock({ x, y, z })?.typeId ?? "minecraft:air";
    } catch {
      return undefined;
    }
    if (isLiquid(id)) return { x, z, ground: y, water: true, house };
    if (isClearable(id)) continue;
    if (isNatural(id)) return { x, z, ground: y, water: false, house };
    house = true; // man-made or unknown: part of a structure, keep looking for the ground under it
  }
  return { x, z, ground: y, water: false, house };
}

export type Verdict = "ok" | "clear" | "blocked";

export interface Survey {
  verdict: Verdict;
  /** Lang key suffix (bannerforge.place.reason.<key>) when blocked; "structure" when clearing. */
  reason?: string;
  /** Plot ground level (y): the ground at the entrance, plus the player's Raise/Lower. */
  groundY: number;
  /** Ground at the entrance before Raise/Lower. */
  entranceY: number;
}

/** Below this share of water columns, water counts as part of a farm or well (cleared), not a lake. */
const WATER_LIMIT = 0.25;

export interface SurveyInput {
  dim: Dimension;
  f: Footprint;
  /** Height of the building's highest level: everything up to here must be clearable. */
  topHeight: number;
  bell: { x: number; y: number; z: number };
  insideBorder: boolean;
  /** Footprints of the settlement's own buildings. */
  others: Footprint[];
  /** Vanilla structures found nearby (see vanilla.ts). */
  vanilla: Rect[];
  /** Raise (+) or lower (-) the floor from the entrance ground. */
  raise: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Can a building go here? Samples columns (every block for small plots, every other for bigger ones). */
export function survey(input: SurveyInput): Survey {
  const { dim, f } = input;
  const blocked = (reason: string, groundY = 0, entranceY = 0): Survey => ({ verdict: "blocked", reason, groundY, entranceY });
  if (!input.insideBorder) return blocked("outside_border");
  if (input.others.some((o) => overlaps(f, o))) return blocked("overlap");
  if (containsColumn(f, input.bell.x, input.bell.z)) return blocked("bell");

  const floor = input.bell.y - 48;
  // The floor lines up with the ground at the entrance (owner decision, 2026-11-15).
  const front: number[] = [];
  for (let lx = 1; lx < f.w - 1; lx++) {
    const p = toWorld(f, lx, f.w - 1);
    const c = readColumn(dim, p.x, p.z, floor);
    if (!c) return blocked("unloaded");
    front.push(c.ground);
  }
  const entranceY = median(front);
  const groundY = entranceY + input.raise;

  const stride = f.w > 9 ? 2 : 1;
  const columns: Column[] = [];
  for (let dx = 0; dx < f.w; dx += stride) {
    for (let dz = 0; dz < f.w; dz += stride) {
      const c = readColumn(dim, f.x + dx, f.z + dz, floor);
      if (!c) return blocked("unloaded", groundY, entranceY);
      columns.push(c);
    }
  }
  const water = columns.filter((c) => c.water).length;
  if (water / columns.length >= WATER_LIMIT) return blocked("water", groundY, entranceY);

  const grounds = columns.map((c) => c.ground);
  if (Math.max(...grounds) - groundY > CUT_MAX) return blocked("hillside", groundY, entranceY);
  if (groundY - Math.min(...grounds) > FILL_MAX) return blocked("steep", groundY, entranceY);

  // Room above: nothing solid and natural (overhangs, cliffs) up to the highest level's roof.
  for (const c of columns) {
    for (let y = Math.max(c.ground, groundY) + 1; y <= groundY + input.topHeight; y++) {
      let id: string;
      try {
        id = dim.getBlock({ x: c.x, y, z: c.z })?.typeId ?? "minecraft:air";
      } catch {
        return blocked("unloaded", groundY, entranceY);
      }
      if (isClearable(id)) continue;
      if (isNatural(id)) return blocked("no_room", groundY, entranceY);
      c.house = true;
    }
  }

  const structures = water > 0 || columns.some((c) => c.house) || input.vanilla.some((v) => rectOverlaps(f, v));
  if (structures) return { verdict: "clear", reason: "structure", groundY, entranceY };
  return { verdict: "ok", groundY, entranceY };
}

/** Most common natural surface and subsurface blocks just outside the plot, for the garden and foundation. */
export function localGround(dim: Dimension, f: Footprint, floor: number): { surface: string; fill: string } {
  const surface = new Map<string, number>();
  const fill = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = -1; i <= f.w; i += 2) {
    for (const [x, z] of [[f.x + i, f.z - 1], [f.x + i, f.z + f.w], [f.x - 1, f.z + i], [f.x + f.w, f.z + i]]) {
      const c = readColumn(dim, x, z, floor);
      if (!c || c.water || c.house) continue;
      try {
        const top = dim.getBlock({ x, y: c.ground, z })?.typeId;
        const below = dim.getBlock({ x, y: c.ground - 1, z })?.typeId;
        if (top && !isManMade(top) && !/path/.test(top)) bump(surface, top);
        if (below && !isManMade(below) && !isClearable(below) && !isLiquid(below)) bump(fill, below);
      } catch {
        // unloaded edge: skip
      }
    }
  }
  const best = (m: Map<string, number>, fallback: string) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  return { surface: best(surface, "minecraft:grass_block"), fill: best(fill, "minecraft:dirt") };
}
