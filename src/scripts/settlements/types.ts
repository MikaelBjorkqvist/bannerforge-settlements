// Data model for settlements. Stored as JSON in world dynamic properties.
// Bump SCHEMA and add a migration in registry.ts whenever this shape changes.

export const SCHEMA = 3;

/** The founding player picks one of these when founding (owner decision, 2026-11-12). */
export type FactionId = "green" | "red" | "blue";
export const FACTIONS: FactionId[] = ["green", "red", "blue"];

/** Settlement tiers. Names are lang keys: bannerforge.tier.<tier> */
export type Tier = "village" | "town" | "city";
export const TIERS: Tier[] = ["village", "town", "city"];

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
  dimension: string;
  /** Location of the village bell the settlement was founded on. */
  center: Vec3;
  /** Player id (not name) of whoever founded it. */
  foundedBy: string;
  foundedAt: number;
  /**
   * Building id -> level of each built instance. Unique buildings have at most one entry;
   * repeatable ones (houses) have one per instance. Prosperity, population and tier are
   * derived from this (see rules.ts), so rebalancing numbers also updates existing worlds.
   */
  buildings: Record<string, BuildingLevel[]>;
}
