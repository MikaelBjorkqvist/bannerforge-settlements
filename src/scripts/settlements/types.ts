// Data model for settlements. Stored as JSON in world dynamic properties.
// Bump SCHEMA and add a migration in registry.ts whenever this shape changes.

export const SCHEMA = 1;

/** The founding player picks one of these when claiming a village (owner decision, 2026-11-12). */
export type FactionId = "green" | "red" | "blue";
export const FACTIONS: FactionId[] = ["green", "red", "blue"];

/** Settlement tiers grow with prosperity. Names are lang keys: bannerforge.tier.<tier> */
export type Tier = "village" | "town" | "city";

/** Building level: 0 = not built, 1 = Basic, 2 = Improved, 3 = Advanced. */
export type BuildingLevel = 0 | 1 | 2 | 3;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Settlement {
  schema: number;
  id: string;
  /** Player-chosen name; stored as typed, shown as-is. */
  name: string;
  faction: FactionId;
  tier: Tier;
  prosperity: number;
  dimension: string;
  /** Location of the village bell the settlement was founded on. */
  center: Vec3;
  /** Player id (not name) of whoever founded it. */
  foundedBy: string;
  foundedAt: number;
  /** Building id -> current level. Missing = 0. */
  buildings: Record<string, BuildingLevel>;
}
