// Settlement rules: limits, prosperity, population, defence points and promotion (owner, 2026-11-17: buildings have
// one level, no tier locks; a settlement is promoted with a ledger button once prosperity, population and defence
// points are met). Pure functions (no game imports) so they can be unit-tested.

import { BUILDINGS, PROMOTION, buildingById, type BuildingDef, type Cost } from "./buildings.js";
import type { BuildingLevel, Settlement, Tier } from "./types.js";

/** Why an action isn't possible. `key` is a lang key suffix (bannerforge.rule.<key>); args fill its %s slots. */
export interface Reason {
  key: string;
  args: string[];
  /** Lang keys among args (building names, tiers) that the UI should translate rather than print. */
  translateArgs?: number[];
}

export type Action = { kind: "build"; id: string };
export type Check = { ok: true; cost: Cost[]; newLevel: BuildingLevel } | { ok: false; reasons: Reason[] };

/** Every instance of a building: 0 = under construction, 1+ = standing (2 and 3 are left from older saves). */
export function instances(s: Settlement, id: string): BuildingLevel[] {
  return s.buildings[id] ?? [];
}

/** How many instances of a building are standing (finished). */
export function built(s: Settlement, id: string): number {
  return instances(s, id).filter((l) => l > 0).length;
}

function sumOver(s: Settlement, pick: (def: BuildingDef) => number): number {
  let total = 0;
  for (const def of BUILDINGS) total += built(s, def.id) * pick(def);
  return total;
}

/** Total prosperity of the standing buildings. */
export const prosperity = (s: Settlement): number => sumOver(s, (d) => d.prosperity);
/**
 * Population: the townsfolk the houses sleep (settlers arriving over time come with the citizens, M2.5). A house
 * sleeps as many as its design has beds (stored on its site when placed). Garrisons are not population.
 */
export function housing(s: Settlement): number {
  let total = 0;
  for (const def of BUILDINGS) {
    if (!def.housing) continue;
    instances(s, def.id).forEach((level, i) => {
      if (level > 0) total += (def.category === "population" ? s.sites?.[def.id]?.[i]?.beds : undefined) ?? def.housing!;
    });
  }
  return total;
}
export const population = housing;
/** Military in barracks, towers and the Keep (owner, 2026-11-17: they sleep there and need no townsfolk). */
export const garrison = (s: Settlement): number => sumOver(s, (d) => d.garrison ?? 0);
/** Workers the standing buildings employ (from the townsfolk). */
export const npcDemand = (s: Settlement): number => sumOver(s, (d) => d.npcs);
/** Defence points: towers, barracks, the Keep. */
export const defence = (s: Settlement): number => sumOver(s, (d) => d.defence ?? 0);

/** People without a job (can be negative: buildings waiting for workers). */
export function freeSlots(s: Settlement): number {
  return population(s) - npcDemand(s);
}

/** The settlement's tier. Older saves had none: their Town Hall level was the tier (2 = Town, 3 = City). */
export function tier(s: Settlement): Tier {
  if (s.tier) return s.tier;
  const th = instances(s, "town_hall").reduce<number>((m, l) => Math.max(m, l), 0);
  return th >= 3 ? "city" : th >= 2 ? "town" : "village";
}

export const TIER_ORDER: Tier[] = ["village", "town", "city"];

export function nextTier(s: Settlement): "town" | "city" | undefined {
  const t = tier(s);
  return t === "village" ? "town" : t === "town" ? "city" : undefined;
}

/** Can the settlement be promoted now? Every unmet requirement is listed. */
export function checkPromotion(s: Settlement): { next?: "town" | "city"; reasons: Reason[] } {
  const next = nextTier(s);
  if (!next) return { reasons: [{ key: "top_tier", args: [] }] };
  const promo = PROMOTION[next];
  const reasons: Reason[] = [];
  for (const id of promo.requires) {
    if (built(s, id) === 0) reasons.push({ key: "needs_building", args: [`bannerforge.building.${id}`], translateArgs: [0] });
  }
  if (prosperity(s) < promo.prosperity) reasons.push({ key: "promo_prosperity", args: [String(prosperity(s)), String(promo.prosperity)] });
  if (population(s) < promo.population) reasons.push({ key: "promo_population", args: [String(population(s)), String(promo.population)] });
  if (defence(s) < promo.defence) reasons.push({ key: "promo_defence", args: [String(defence(s)), String(promo.defence)] });
  return { next, reasons };
}

/** Promotes the settlement to its next tier. Call only after checkPromotion() returned no reasons. */
export function promote(s: Settlement): void {
  const next = nextTier(s);
  if (next) s.tier = next;
}

/** Price of the next one: repeatable buildings with a price step cost more for every one you already have. */
export function costFor(s: Settlement, def: BuildingDef): Cost[] {
  return [{ item: "minecraft:emerald", amount: def.emeralds + (def.priceStep ?? 0) * instances(s, def.id).length }];
}

/** Can this building be built right now? Returns the cost, or every reason it is blocked. */
export function check(s: Settlement, action: Action): Check {
  const def = buildingById(action.id);
  if (!def) return { ok: false, reasons: [{ key: "unknown", args: [action.id] }] };
  const count = instances(s, def.id).length;
  if (def.perTier) {
    const limit = def.perTier[tier(s)];
    if (count >= limit) return { ok: false, reasons: [{ key: "limit", args: [String(limit), `bannerforge.tier.${tier(s)}`], translateArgs: [1] }] };
  } else if (count > 0) {
    return { ok: false, reasons: [{ key: "already_built", args: [] }] };
  }
  // Buildings without free workers can still be built (owner, 2026-11-17); they wait for one (M2.5).
  return { ok: true, cost: costFor(s, def), newLevel: 1 };
}

/** Applies a checked build (perimeter-free buildings are placed instead, see placement.ts). */
export function apply(s: Settlement, action: Action, newLevel: BuildingLevel): void {
  (s.buildings[action.id] ??= []).push(newLevel);
}
