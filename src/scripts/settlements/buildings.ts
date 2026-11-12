// Building catalogue and economy numbers. Emeralds are the currency for now (owner decision, 2026-11-12);
// other resources come later, which is why a cost is a list of items rather than one number.
// ALL NUMBERS ARE PLACEHOLDERS FOR PLAY-TESTING. Balance them here, nowhere else.

import type { BuildingLevel, Settlement, Tier } from "./types.js";

export interface Cost {
  item: string;
  amount: number;
}

export interface BuildingDef {
  /** Also the lang key suffix: bannerforge.building.<id> */
  id: string;
  /** Cost to reach level 1, 2 and 3. */
  costs: [Cost[], Cost[], Cost[]];
  /** Prosperity gained when reaching level 1, 2 and 3. */
  prosperity: [number, number, number];
}

const emeralds = (amount: number): Cost[] => [{ item: "minecraft:emerald", amount }];

export const BUILDINGS: BuildingDef[] = [
  { id: "houses", costs: [emeralds(4), emeralds(10), emeralds(20)], prosperity: [3, 5, 8] },
  { id: "stores", costs: [emeralds(6), emeralds(14), emeralds(28)], prosperity: [4, 6, 10] },
  { id: "tavern", costs: [emeralds(8), emeralds(16), emeralds(32)], prosperity: [4, 7, 10] },
  { id: "walls", costs: [emeralds(10), emeralds(20), emeralds(40)], prosperity: [3, 5, 8] },
  { id: "gates", costs: [emeralds(6), emeralds(12), emeralds(24)], prosperity: [2, 3, 5] },
  { id: "towers", costs: [emeralds(8), emeralds(16), emeralds(32)], prosperity: [2, 4, 6] },
  { id: "barracks", costs: [emeralds(12), emeralds(24), emeralds(48)], prosperity: [3, 5, 8] },
];

/** Minimum prosperity for each tier, highest first. */
export const TIER_THRESHOLDS: [Tier, number][] = [
  ["city", 80],
  ["town", 30],
  ["village", 0],
];

export function tierFor(prosperity: number): Tier {
  return TIER_THRESHOLDS.find(([, min]) => prosperity >= min)![0];
}

export function levelOf(s: Settlement, id: string): BuildingLevel {
  return s.buildings[id] ?? 0;
}
