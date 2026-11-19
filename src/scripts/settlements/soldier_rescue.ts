// Soldier safety net. Fighting, going back to the post, falling back and healing live in the behaviour file
// (BP/entities/soldier.json; owner 2026-11-19: entities carry the AI, modelled on the iron golem and Guard Villagers).
// Like Guard Villagers' walk-back goal, which gives up when the patrol point can't be reached, this pass only helps a
// soldier who is far from his post and hasn't moved for 30 seconds (caught on a fence, in a hole, across water): he
// is put back at his post, but only when no player is within 24 blocks.
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
/** Further than this from his post counts as away (the widest duty wander area is the patrol's 40). */
const AWAY = 44;
const last = new Map<string, { at: Vector3; since: number }>();

export function registerSoldierRescue(): void {
  system.runInterval(() => {
    const now = system.currentTick;
    const seen = new Set<string>();
    for (const s of allSettlements()) {
      const dim = world.getDimension(s.dimension);
      for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: BORDER_RADIUS[tier(s)] + 40 })) {
        seen.add(e.id);
        const post = postAt(e);
        const away = post ? Math.hypot(post.x - e.location.x, post.z - e.location.z) : 0;
        const limit = e.getProperty("bannerforge_settlements:duty") === "patrol" ? AWAY : 24;
        if (!post || away <= limit) {
          last.delete(e.id);
          continue;
        }
        const was = last.get(e.id);
        if (!was || Math.hypot(was.at.x - e.location.x, was.at.z - e.location.z) > 1) {
          last.set(e.id, { at: { ...e.location }, since: now });
          continue;
        }
        if (now - was.since >= RESCUE_TICKS && !dim.getPlayers({ location: e.location, maxDistance: 24 }).length) {
          e.teleport(post);
          last.delete(e.id);
        }
      }
    }
    for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
  }, INTERVAL);
}
