// Townsfolk watchdog (owner 2026-11-19: townsfolk need good AI too). The citizen entity is a full copy of the
// vanilla villager, so working, sleeping, gossip, fleeing from zombies and hiding when the bell rings are vanilla
// behaviour. This pass catches what vanilla leaves to chance:
//  - strays: a townsperson who wandered well outside the border is brought back near the bell
//  - stuck in water: still in water two passes in a row (about 20 s) -> back on land near the bell
// Only when no player is within 24 blocks, so nobody sees anyone vanish. Newcomers and people leaving are left alone.
//
// Performance (CLAUDE.md rule 6): every 10 seconds, one entity query per loaded town.

import { type Entity, system, world } from "@minecraft/server";
import { CITIZEN_ID } from "./citizen_npc.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements } from "./registry.js";
import { tier } from "./rules.js";
import type { Settlement } from "./types.js";

const INTERVAL = 200;
const STRAY = 12;
const wet = new Set<string>();

export function registerTownsfolkAi(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        watch(s);
      } catch (err) {
        console.warn(`[BannerForge] townsfolk ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);
}

function watch(s: Settlement): void {
  const dim = world.getDimension(s.dimension);
  const r = BORDER_RADIUS[tier(s)];
  for (const e of dim.getEntities({ type: CITIZEN_ID, location: s.center, maxDistance: (r + 48) * 1.42 })) {
    if (e.hasTag("bannerforge:leaving") || role(e) === "applicant") continue;
    const out = Math.max(Math.abs(e.location.x - s.center.x), Math.abs(e.location.z - s.center.z)) - r;
    if (out > 48) continue; // someone else's townsperson
    const stray = out > STRAY;
    const stuck = e.isInWater && wet.has(e.id);
    if (e.isInWater) wet.add(e.id);
    else wet.delete(e.id);
    if (!(stray || stuck) || dim.getPlayers({ location: e.location, maxDistance: 24 }).length) continue;
    const spot = nearBell(s);
    if (spot) {
      e.teleport(spot);
      wet.delete(e.id);
    }
  }
}

function role(e: Entity): unknown {
  try {
    return e.getProperty("bannerforge_settlements:role");
  } catch {
    return undefined;
  }
}

/** A dry spot a few blocks from the bell. */
function nearBell(s: Settlement) {
  const dim = world.getDimension(s.dimension);
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 4], [-4, -4]]) {
    try {
      const top = dim.getTopmostBlock({ x: s.center.x + dx, z: s.center.z + dz });
      if (top && !top.isLiquid) return { x: top.location.x + 0.5, y: top.location.y + 1, z: top.location.z + 0.5 };
    } catch {
      return undefined;
    }
  }
  return undefined;
}
