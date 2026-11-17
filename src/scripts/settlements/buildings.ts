// Building catalogue — the data side of docs/BUILDINGS.md (approved plan v2).
// Emeralds are the currency for now; a cost is a list of items so other resources can join later.
// ALL NUMBERS ARE PLACEHOLDERS FOR PLAY-TESTING. Balance them here, nowhere else.

import type { Tier } from "./types.js";

export interface Cost {
  item: string;
  amount: number;
}

/** Player-facing groups in the steward ledger (lang: bannerforge.category.<id>). */
export type Category = "centre" | "population" | "trade" | "food" | "defence";
export const CATEGORIES: Category[] = ["centre", "population", "trade", "food", "defence"];
export type Plot = "S" | "M" | "L" | "perimeter";

export interface BuildingDef {
  /** Also the lang key suffix: bannerforge.building.<id> */
  id: string;
  category: Category;
  plot: Plot;
  /** Emeralds to build it. Buildings have one level (owner, 2026-11-17: no building tiers). */
  emeralds: number;
  /** Prosperity it adds (per instance). */
  prosperity: number;
  /** Workers it employs (per instance). Each takes one free person from the population. */
  npcs: number;
  /** Population it houses (houses only). */
  housing?: number;
  /** Defence points it adds (per instance): towers, barracks, the Keep (owner, 2026-11-17). */
  defence?: number;
  /** Repeatable buildings: how many instances each tier allows. Absent = unique. */
  perTier?: Record<Tier, number>;
  /** Optional sub-heading inside its section (lang: bannerforge.group.<id>), e.g. Craftsmen under Trade. */
  group?: "craftsmen";
}

// No tier locks and no building levels (owner, 2026-11-16 / 2026-11-17): everything can be built from the start.
// Military NPC ranks (militia -> soldier -> knight) and civilian ranks come with the citizens (M2.5).
export const BUILDINGS: BuildingDef[] = [
  // Town centre
  { id: "town_hall", category: "centre", plot: "M", emeralds: 8, prosperity: 5, npcs: 0 },
  { id: "keep", category: "centre", plot: "L", emeralds: 16, prosperity: 6, npcs: 1, defence: 6 },
  { id: "shrine", category: "centre", plot: "S", emeralds: 8, prosperity: 4, npcs: 1 },
  { id: "warehouse", category: "centre", plot: "L", emeralds: 6, prosperity: 2, npcs: 1 },
  // Population (houses raise the population)
  { id: "house", category: "population", plot: "M", emeralds: 3, prosperity: 1, npcs: 0, housing: 2, perTier: { village: 4, town: 8, city: 12 } },
  // Trade
  { id: "market", category: "trade", plot: "M", emeralds: 6, prosperity: 4, npcs: 1 },
  { id: "tavern", category: "trade", plot: "M", emeralds: 8, prosperity: 4, npcs: 1 },
  { id: "stables", category: "trade", plot: "M", emeralds: 8, prosperity: 2, npcs: 1 },
  // Trade › Craftsmen
  { id: "blacksmith", category: "trade", group: "craftsmen", plot: "M", emeralds: 8, prosperity: 3, npcs: 1 },
  { id: "fletcher", category: "trade", group: "craftsmen", plot: "S", emeralds: 5, prosperity: 2, npcs: 1 },
  { id: "alchemist", category: "trade", group: "craftsmen", plot: "S", emeralds: 8, prosperity: 3, npcs: 1 },
  { id: "stonemason", category: "trade", group: "craftsmen", plot: "M", emeralds: 6, prosperity: 2, npcs: 1 },
  { id: "woodcarver", category: "trade", group: "craftsmen", plot: "S", emeralds: 5, prosperity: 2, npcs: 1 },
  // Food
  { id: "farmstead", category: "food", plot: "L", emeralds: 6, prosperity: 3, npcs: 1 },
  { id: "docks", category: "food", plot: "L", emeralds: 8, prosperity: 3, npcs: 1 },
  // Defence: defence points instead of a walls prerequisite (owner, 2026-11-17). The wall / gate / tower system
  // with its own building interface is not decided yet; the old "Defences" perimeter purchase is gone.
  { id: "watchtower", category: "defence", plot: "S", emeralds: 6, prosperity: 1, npcs: 1, defence: 2, perTier: { village: 3, town: 6, city: 10 } },
  { id: "barracks", category: "defence", plot: "L", emeralds: 12, prosperity: 3, npcs: 2, defence: 4 },
];

/** What a promotion needs (owner, 2026-11-17): a Town Hall, then prosperity, population and defence points. */
export interface Promotion {
  prosperity: number;
  population: number;
  defence: number;
  /** Buildings that must stand. */
  requires: string[];
}
export const PROMOTION: Record<"town" | "city", Promotion> = {
  town: { prosperity: 22, population: 6, defence: 4, requires: ["town_hall"] },
  city: { prosperity: 40, population: 14, defence: 12, requires: ["town_hall"] },
};

/** Paid to the (still neutral) steward when founding a settlement. Owner decision, 2026-11-12. */
export const FOUNDING_COST: Cost[] = [{ item: "minecraft:emerald", amount: 10 }];

export function buildingById(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
