// Soldier safety net. Fighting, chasing limits, retreating and healing live in the behaviour file
// (BP/entities/soldier.json: duty home areas, environment sensors, heal timer; owner 2026-11-19: entities carry the
// AI). This pass only rescues a soldier who is on his way back to his post and hasn't moved for 30 seconds (caught on
// a fence, in a hole): he is put back at his post, but only when no player is within 24 blocks.
//
// Performance (CLAUDE.md rule 6): every 5 seconds, one entity query per town, constant work per soldier.

import { system, type Vector3, world } from "@minecraft/server";
import { postAt } from "./garrison.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements } from "./registry.js";
import { tier } from "./rules.js";
import { SOLDIER_ID } from "./soldier.js";

const INTERVAL = 100;
const RESCUE_TICKS = 600;
const last = new Map<string, { at: Vector3; since: number }>();

export function registerSoldierRescue(): void {
  system.runInterval(() => {
    const now = system.currentTick;
    const seen = new Set<string>();
    for (const s of allSettlements()) {
      const dim = world.getDimension(s.dimension);
      for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: BORDER_RADIUS[tier(s)] + 40 })) {
        seen.add(e.id);
        if (!e.getProperty("bannerforge_settlements:retreating")) {
          last.delete(e.id);
          continue;
        }
        const was = last.get(e.id);
        if (!was || Math.hypot(was.at.x - e.location.x, was.at.z - e.location.z) > 1) {
          last.set(e.id, { at: { ...e.location }, since: now });
          continue;
        }
        const post = postAt(e);
        if (post && now - was.since >= RESCUE_TICKS && !dim.getPlayers({ location: e.location, maxDistance: 24 }).length) {
          e.teleport(post);
          last.delete(e.id);
        }
      }
    }
    for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
  }, INTERVAL);
}
