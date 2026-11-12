import { world } from "@minecraft/server";
import { SCHEMA, type Settlement, type Vec3 } from "./types.js";

// One dynamic property per settlement keeps each value small (string properties have size limits)
// and lets us add/remove settlements without rewriting the others.
const PREFIX = "bannerforge:settlement:";

function migrate(raw: Settlement): Settlement {
  // Future: if (raw.schema === 1) { ...convert to 2... }
  raw.buildings ??= {};
  return raw;
}

export function allSettlements(): Settlement[] {
  const result: Settlement[] = [];
  for (const key of world.getDynamicPropertyIds()) {
    if (!key.startsWith(PREFIX)) continue;
    const value = world.getDynamicProperty(key);
    if (typeof value !== "string") continue;
    try {
      result.push(migrate(JSON.parse(value) as Settlement));
    } catch {
      console.warn(`[BannerForge] corrupt settlement data in ${key}`);
    }
  }
  return result;
}

export function saveSettlement(s: Settlement): void {
  s.schema = SCHEMA;
  world.setDynamicProperty(PREFIX + s.id, JSON.stringify(s));
}

export function newSettlementId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Nearest settlement in the same dimension within `radius` blocks (horizontal), if any. */
export function settlementNear(dimension: string, pos: Vec3, radius: number): Settlement | undefined {
  let best: Settlement | undefined;
  let bestDist = radius * radius;
  for (const s of allSettlements()) {
    if (s.dimension !== dimension) continue;
    const d = (s.center.x - pos.x) ** 2 + (s.center.z - pos.z) ** 2;
    if (d <= bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
