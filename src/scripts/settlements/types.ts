// Data model for settlements. Stored as JSON in world dynamic properties.
// Bump SCHEMA and add a migration in registry.ts whenever this shape changes.

export const SCHEMA = 5;

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
  /** The steward who keeps the ledger (schema 4). Missing on older worlds until the bell is rung. */
  steward?: StewardRecord;
  /**
   * Where each building instance stands (schema 5). Parallel to `buildings`: sites[id][i] is the plot of
   * buildings[id][i]. null = not placed yet (bought before M2a, or a perimeter building like Defences).
   */
  sites?: Record<string, (Site | null)[]>;
}

/** A building's plot in the world and its construction state. */
export interface Site {
  /** Min corner (x, z) and ground level (y) of the plot. */
  x: number;
  y: number;
  z: number;
  /** Plot width along the entrance side. */
  w: number;
  /** Plot depth, back to entrance. Missing on sites placed before 2026-11-17 (square plots): same as w. */
  d?: number;
  /** Entrance direction, see plots.ts. */
  rot: 0 | 1 | 2 | 3;
  /** Design variant (generated/blueprints.ts), kept through upgrades. Missing = placeholder box. */
  variant?: string;
  /** Level currently standing on the plot (0 = only the site so far). */
  built: BuildingLevel;
  /** Construction in progress. */
  build?: Construction;
}

export interface Construction {
  /** Level being built. */
  to: BuildingLevel;
  /** gameTime() (clock.ts) when construction started. */
  start: number;
  /** Steps finished (0..5, see plots.ts STEPS). */
  done: number;
}

/** Which faction outfit an NPC wears (entity property bannerforge:outfit). 0 = neutral, before founding. */
export const OUTFIT_INDEX: Record<FactionId | "neutral", number> = { neutral: 0, green: 1, blue: 2, red: 3 };

export interface StewardRecord {
  /** Personal name; the name tag shows "Steward, <name>". */
  name: string;
  /** Skin layer index (entity property bannerforge:skin). */
  skin: number;
  /** Entity id of the living steward, to find it quickly. */
  entityId?: string;
  /** gameTime() (clock.ts) when the steward died; cleared when they return. */
  diedAt?: number;
}
