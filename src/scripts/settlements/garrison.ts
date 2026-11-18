// Garrisons in the world (owner 2026-11-18): soldiers come with a finished military building and stand at its door;
// a fallen soldier is replaced at the next dawn; their rank follows the tier. Soldiers belong to a post through a tag
// (bannerforge:post:<settlement>:<building>:<instance>), so the world itself is the record of who is alive.
//
// Performance (CLAUDE.md rule 6): one pass every 5 seconds, a few tag queries per settlement, and only posts whose
// chunk is loaded are touched (a soldier in an unloaded chunk can't be seen, so nothing is refilled there).

import { type Dimension, type Entity, system, type Vector3, world } from "@minecraft/server";
import { BORDER_RADIUS, toWorld } from "./plots.js";
import { gameTime } from "./clock.js";
import { allSettlements, saveSettlement } from "./registry.js";
import { garrisonRank, posts, tier, type Post } from "./rules.js";
import { SOLDIER_ID, spawnSoldier, soldierTitle } from "./soldier.js";
import type { Settlement } from "./types.js";

const INTERVAL = 100;
/** Same morning window as the settlers (citizens.ts): from 7:00 to dusk. */
const DAWN = 1000;
const DUSK = 12000;
const RANK_PROP = "bannerforge_settlements:rank";

export const postTag = (s: Settlement, p: Pick<Post, "id" | "index">) => `bannerforge:post:${s.id}:${p.id}:${p.index}`;
const settlementPrefix = (s: Settlement) => `bannerforge:post:${s.id}:`;

export function registerGarrisons(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        maintain(s);
      } catch (err) {
        console.warn(`[BannerForge] garrison ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);
}

/** Sends new garrisons, refills at dawn, keeps ranks in step with the tier and dismisses soldiers of lost posts. */
export function maintain(s: Settlement, forceDawn = false): void {
  const dim = world.getDimension(s.dimension);
  const now = gameTime();
  const day = Math.floor(now / 24000);
  const tod = now % 24000;
  const dawn = forceDawn || ((s.garrisonDay ?? -1) < day && tod >= DAWN && tod < DUSK);
  const rank = garrisonRank(s);
  let changed = false;

  const live = new Set<string>();
  for (const post of posts(s)) {
    const tag = postTag(s, post);
    live.add(tag);
    const door = doorOf(dim, post);
    if (!door) continue; // chunk not loaded
    const soldiers = dim.getEntities({ type: SOLDIER_ID, tags: [tag] });
    for (const e of soldiers) syncRank(e, post, rank);
    if (!post.site.manned || dawn) {
      for (let n = soldiers.length; n < post.count; n++) {
        const e = spawnSoldier(dim, door, post.kind, s.faction, `${tag}:${now}:${n}`, rank);
        e.addTag(tag);
      }
      if (!post.site.manned) {
        post.site.manned = true;
        changed = true;
      }
    }
  }
  if (dawn && s.garrisonDay !== day) {
    s.garrisonDay = day;
    changed = true;
  }

  // Soldiers whose building is gone go home for good.
  const r = BORDER_RADIUS[tier(s)] + 32;
  for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: r })) {
    const tag = e.getTags().find((t) => t.startsWith(settlementPrefix(s)));
    if (tag && !live.has(tag)) e.remove();
  }
  if (changed) saveSettlement(s);
}

/** Rank and title follow the tier (the Captain's training takes over later). */
function syncRank(e: Entity, post: Post, rank: 1 | 2 | 3): void {
  if (e.getProperty(RANK_PROP) === rank) return;
  e.triggerEvent(`bannerforge:rank_${rank}`);
  const name = e.nameTag.split(", ")[1];
  if (name) e.nameTag = `${soldierTitle(post.kind, rank)}, ${name}`;
}

/**
 * Where the garrison stands: just outside the middle of the entrance, on the first free spot from the plot's ground
 * up. Undefined while the chunk isn't loaded.
 */
function doorOf(dim: Dimension, post: Post): Vector3 | undefined {
  const site = post.site;
  const w = site.w;
  const d = site.d ?? site.w;
  const at = toWorld({ x: site.x, z: site.z, w, d, rot: site.rot }, Math.floor((w - 1) / 2), d);
  for (let y = site.y + 1; y <= site.y + 6; y++) {
    let feet, head;
    try {
      feet = dim.getBlock({ x: at.x, y, z: at.z });
      head = dim.getBlock({ x: at.x, y: y + 1, z: at.z });
    } catch {
      return undefined;
    }
    if (!feet || !head) return undefined;
    if (feet.isAir && head.isAir) return { x: at.x + 0.5, y, z: at.z + 0.5 };
  }
  return { x: at.x + 0.5, y: site.y + 1, z: at.z + 0.5 };
}
