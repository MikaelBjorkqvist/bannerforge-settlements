// Building catalogue — the data side of docs/BUILDINGS.md (approved plan v2).
// Emeralds are the currency for now; a cost is a list of items so other resources can join later.
// ALL NUMBERS ARE PLACEHOLDERS FOR PLAY-TESTING. Balance them here, nowhere else.

import type { Tier } from "./types.js";

export interface Cost {
  item: string;
  amount: number;
}

/**
 * Ledger sections, which are also the scores (owner, 2026-11-18): Housing gives room for people; Economy, Military
 * and Civic each have a score, and Prosperity is their sum. "I need Economy, so I pick something from Economy."
 * (lang: bannerforge.category.<id>)
 */
export type Category = "housing" | "economy" | "military" | "civic";
export const CATEGORIES: Category[] = ["housing", "economy", "military", "civic"];
/** The categories that score (Housing gives room, not points). */
export type ScoreCategory = Exclude<Category, "housing">;
export const SCORES: ScoreCategory[] = ["economy", "military", "civic"];
export type Plot = "S" | "M" | "L" | "perimeter";

export interface BuildingDef {
  /** Also the lang key suffix: bannerforge.building.<id> */
  id: string;
  category: Category;
  plot: Plot;
  /** Emeralds to build it. Buildings have one level (owner, 2026-11-17: no building tiers). */
  emeralds: number;
  /** Repeatable buildings: each one costs this many emeralds more than the one before. */
  priceStep?: number;
  /**
   * Points it adds to its category's score (per instance, once it is staffed): Economy and Civic. Military
   * buildings score with `defence` instead.
   */
  prosperity: number;
  /** Workers it employs (per instance). Each takes one free person from the population. */
  npcs: number;
  /** People it houses (houses; a house with a design sleeps as many as its beds). */
  housing?: number;
  /**
   * Military living and serving in the building itself (owner, 2026-11-17): they sleep there, need no free
   * townsfolk, and don't count as population. Their rank follows the tier (lang bannerforge.garrison.<id>.<tier>).
   */
  garrison?: number;
  /** Defence points it adds (per instance): towers, barracks, the Keep (owner, 2026-11-17). */
  defence?: number;
  /** Repeatable buildings: how many instances each tier allows. Absent = unique. */
  perTier?: Record<Tier, number>;
  /** Optional sub-heading inside its section (lang: bannerforge.group.<id>), e.g. Craftsmen under Economy. */
  group?: "shops" | "craftsmen" | "food";
}

// No tier locks and no building levels (owner, 2026-11-16 / 2026-11-17): everything can be built from the start.
export const BUILDINGS: BuildingDef[] = [
  // Housing: room for people (not points)
  // Houses (owner, 2026-11-17): no limit, but each costs 1 more than the last; a house sleeps as many people as its
  // design has beds (`housing` is only the fallback for a house without a design).
  { id: "house", category: "housing", plot: "M", emeralds: 3, priceStep: 1, prosperity: 0, npcs: 0, housing: 2, perTier: { village: Infinity, town: Infinity, city: Infinity } },
  // Economy: shops, craftsmen, food (owner, 2026-11-18: all stores, the tavern too)
  { id: "market", category: "economy", group: "shops", plot: "M", emeralds: 6, prosperity: 4, npcs: 1 },
  { id: "tavern", category: "economy", group: "shops", plot: "M", emeralds: 8, prosperity: 4, npcs: 1 },
  { id: "stables", category: "economy", group: "shops", plot: "M", emeralds: 8, prosperity: 2, npcs: 1 },
  { id: "warehouse", category: "economy", group: "shops", plot: "L", emeralds: 6, prosperity: 2, npcs: 1 },
  { id: "blacksmith", category: "economy", group: "craftsmen", plot: "M", emeralds: 8, prosperity: 3, npcs: 1 },
  { id: "fletcher", category: "economy", group: "craftsmen", plot: "S", emeralds: 5, prosperity: 2, npcs: 1 },
  { id: "alchemist", category: "economy", group: "craftsmen", plot: "S", emeralds: 8, prosperity: 3, npcs: 1 },
  { id: "stonemason", category: "economy", group: "craftsmen", plot: "M", emeralds: 6, prosperity: 2, npcs: 1 },
  { id: "woodcarver", category: "economy", group: "craftsmen", plot: "S", emeralds: 5, prosperity: 2, npcs: 1 },
  { id: "farmstead", category: "economy", group: "food", plot: "L", emeralds: 6, prosperity: 3, npcs: 1 },
  { id: "docks", category: "economy", group: "food", plot: "L", emeralds: 8, prosperity: 3, npcs: 1 },
  // Military: defence buildings and their garrisons (owner, 2026-11-17/18). Garrisons sleep in their own building
  // and start at the lowest rank; the tier only unlocks higher ranks, the Captain trains them (later).
  { id: "watchtower", category: "military", plot: "S", emeralds: 6, prosperity: 0, npcs: 0, garrison: 1, defence: 2, perTier: { village: 3, town: 6, city: 10 } },
  { id: "barracks", category: "military", plot: "L", emeralds: 12, prosperity: 0, npcs: 0, garrison: 4, defence: 4, perTier: { village: 1, town: 2, city: 3 } },
  { id: "keep", category: "military", plot: "L", emeralds: 16, prosperity: 0, npcs: 0, garrison: 2, defence: 6 },
  // Civic: public places without trade (owner, 2026-11-18): the Town Hall, the shrine; plazas, parks, statues later
  { id: "town_hall", category: "civic", plot: "M", emeralds: 8, prosperity: 5, npcs: 0 },
  { id: "shrine", category: "civic", plot: "S", emeralds: 8, prosperity: 4, npcs: 1 },
];

/**
 * What a promotion needs (owner, 2026-11-18): a Town Hall, Prosperity (Economy + Military + Civic), Population, and
 * a minimum Military so a town of only markets can't grow without guards.
 */
export interface Promotion {
  prosperity: number;
  population: number;
  military: number;
  /** Buildings that must stand. */
  requires: string[];
}
export const PROMOTION: Record<"town" | "city", Promotion> = {
  // Prosperity now includes Military: Town 22 + 4 and City 40 + 12 from the previous separate numbers.
  town: { prosperity: 26, population: 6, military: 4, requires: ["town_hall"] },
  city: { prosperity: 52, population: 14, military: 12, requires: ["town_hall"] },
};

/** Paid to the (still neutral) steward when founding a settlement. Owner decision, 2026-11-12. */
export const FOUNDING_COST: Cost[] = [{ item: "minecraft:emerald", amount: 10 }];

export function buildingById(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
