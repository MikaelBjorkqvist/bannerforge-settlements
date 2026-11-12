// Building catalogue — the data side of docs/BUILDINGS.md (approved plan v2).
// Emeralds are the currency for now; a cost is a list of items so other resources can join later.
// ALL NUMBERS ARE PLACEHOLDERS FOR PLAY-TESTING. Balance them here, nowhere else.

import type { Tier } from "./types.js";

export interface Cost {
  item: string;
  amount: number;
}

export type Category = "core" | "housing" | "economy" | "crafts" | "civic" | "defence" | "military";
export type Plot = "S" | "M" | "L" | "perimeter";

/** A requirement on another building: `id` must exist at `level` or higher. */
export interface BuildingReq {
  id: string;
  level: 1 | 2 | 3;
}

export interface BuildingDef {
  /** Also the lang key suffix: bannerforge.building.<id> */
  id: string;
  category: Category;
  plot: Plot;
  /** Emeralds to reach level 1, 2 and 3. */
  emeralds: [number, number, number];
  /** Prosperity added by level 1, 2 and 3 (per instance). */
  prosperity: [number, number, number];
  /** NPCs the building employs at level 1, 2 and 3 (per instance). Each takes one population slot. */
  npcs: [number, number, number];
  /** Population cap added at level 1, 2 and 3 (houses only). */
  housing?: [number, number, number];
  /** Repeatable buildings: how many instances each tier allows. Absent = unique. */
  perTier?: Record<Tier, number>;
  /** Lowest tier that can build level 1. */
  minTier?: Tier;
  /** Buildings needed before level 1. */
  requires?: BuildingReq[];
  /** Town Hall only: may be one level above the tier cap, because upgrading it is the promotion step. */
  promotes?: true;
}

export const BUILDINGS: BuildingDef[] = [
  // Core
  { id: "town_hall", category: "core", plot: "M", emeralds: [8, 20, 40], prosperity: [5, 10, 15], npcs: [0, 0, 0], promotes: true },
  { id: "keep", category: "core", plot: "L", emeralds: [16, 32, 56], prosperity: [6, 10, 15], npcs: [1, 3, 3], minTier: "town", requires: [{ id: "walls", level: 1 }] },
  // Housing
  { id: "house", category: "housing", plot: "M", emeralds: [3, 6, 10], prosperity: [1, 2, 3], npcs: [0, 0, 0], housing: [2, 3, 4], perTier: { village: 4, town: 8, city: 12 } },
  // Economy
  { id: "market", category: "economy", plot: "M", emeralds: [6, 14, 28], prosperity: [4, 6, 8], npcs: [1, 2, 3] },
  { id: "tavern", category: "economy", plot: "M", emeralds: [8, 16, 32], prosperity: [4, 6, 8], npcs: [1, 2, 3] },
  { id: "warehouse", category: "economy", plot: "L", emeralds: [6, 12, 24], prosperity: [2, 3, 5], npcs: [1, 1, 1] },
  { id: "farmstead", category: "economy", plot: "L", emeralds: [6, 14, 28], prosperity: [3, 5, 7], npcs: [1, 1, 1] },
  { id: "docks", category: "economy", plot: "L", emeralds: [8, 16, 32], prosperity: [3, 5, 8], npcs: [1, 1, 1] },
  // Crafts
  { id: "blacksmith", category: "crafts", plot: "M", emeralds: [8, 18, 36], prosperity: [3, 5, 7], npcs: [1, 1, 1] },
  { id: "fletcher", category: "crafts", plot: "S", emeralds: [5, 12, 24], prosperity: [2, 4, 6], npcs: [1, 1, 1] },
  { id: "alchemist", category: "crafts", plot: "S", emeralds: [8, 18, 36], prosperity: [3, 5, 7], npcs: [1, 1, 1] },
  { id: "stonemason", category: "crafts", plot: "M", emeralds: [6, 14, 28], prosperity: [2, 4, 6], npcs: [1, 1, 1] },
  { id: "woodcarver", category: "crafts", plot: "S", emeralds: [5, 12, 24], prosperity: [2, 4, 6], npcs: [1, 1, 1] },
  // Civic
  { id: "shrine", category: "civic", plot: "S", emeralds: [8, 18, 36], prosperity: [4, 6, 10], npcs: [1, 1, 1] },
  { id: "stables", category: "civic", plot: "M", emeralds: [8, 16, 32], prosperity: [2, 4, 6], npcs: [1, 1, 1], minTier: "town" },
  // Defence (perimeter). Gates/towers are repeatable until the perimeter system places them (roadmap M3).
  { id: "walls", category: "defence", plot: "perimeter", emeralds: [10, 20, 40], prosperity: [2, 4, 6], npcs: [0, 0, 0] },
  { id: "gates", category: "defence", plot: "perimeter", emeralds: [4, 8, 16], prosperity: [1, 2, 3], npcs: [0, 2, 2], perTier: { village: 2, town: 3, city: 4 }, requires: [{ id: "walls", level: 1 }] },
  { id: "towers", category: "defence", plot: "perimeter", emeralds: [4, 8, 16], prosperity: [1, 2, 3], npcs: [0, 1, 1], perTier: { village: 2, town: 4, city: 6 }, requires: [{ id: "walls", level: 1 }] },
  // Military
  { id: "barracks", category: "military", plot: "L", emeralds: [12, 24, 48], prosperity: [3, 5, 7], npcs: [3, 5, 5], requires: [{ id: "walls", level: 1 }] },
];

/** Level 3 of `from` gives `percent` off every level of the `to` buildings (BUILDINGS.md). */
export const DISCOUNTS: { from: string; to: string[]; percent: number }[] = [
  { from: "stonemason", to: ["walls", "gates", "towers"], percent: 20 },
  { from: "woodcarver", to: ["house", "tavern"], percent: 20 },
];

/** What a promotion needs. It happens when the matching Town Hall level is bought. */
export interface Promotion {
  townHallLevel: 2 | 3;
  prosperity: number;
  population: number;
  requires: BuildingReq[];
}
export const PROMOTION: Record<"town" | "city", Promotion> = {
  town: { townHallLevel: 2, prosperity: 30, population: 6, requires: [{ id: "walls", level: 1 }] },
  city: { townHallLevel: 3, prosperity: 120, population: 16, requires: [{ id: "walls", level: 2 }, { id: "barracks", level: 2 }] },
};

/** Highest level a normal building may reach in each tier (the Town Hall may go one higher). */
export const TIER_MAX_LEVEL: Record<Tier, 1 | 2 | 3> = { village: 1, town: 2, city: 3 };

/** Paid to the (still neutral) steward when founding a settlement. Owner decision, 2026-11-12. */
export const FOUNDING_COST: Cost[] = [{ item: "minecraft:emerald", amount: 10 }];

export function buildingById(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
