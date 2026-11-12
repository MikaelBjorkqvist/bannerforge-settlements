// Data model for settlements. Stored as JSON in world dynamic properties.
// Bump SCHEMA and add a migration in registry.ts whenever this shape changes.

export const SCHEMA = 1;

export type FactionId = "unaligned" | "green" | "red" | "blue";
export const FACTIONS: FactionId[] = ["unaligned", "green", "red", "blue"];

/** Settlement tiers grow with buildings and prosperity. Names are lang keys: bannerforge.tier.<tier> */
export type Tier = "village" | "town" | "city";

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
}
