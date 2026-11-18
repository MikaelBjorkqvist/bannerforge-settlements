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
import { news } from "./people.js";
import { SOLDIER_ID, spawnSoldier, soldierTitle } from "./soldier.js";
import { buildingName, raw, t, txt } from "./text.js";
import type { Settlement, Site } from "./types.js";

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
      // Who is missing: each soldier of a post has a duty (its index), so a refill takes the fallen one's place.
      const held = new Set(soldiers.map((e) => Number(e.getDynamicProperty(P_DUTY) ?? -1)));
      for (let n = 0, missing = post.count - soldiers.length; n < post.count && missing > 0; n++) {
        if (held.has(n)) continue;
        missing--;
        const duty = dutyOf(dim, s, post, n, door);
        const e = spawnSoldier(dim, duty.at, post.kind, s.faction, `${tag}:${now}:${n}`, rank);
        e.addTag(tag);
        e.setDynamicProperty(P_DUTY, n);
        if (duty.patrol) e.triggerEvent("bannerforge:patrol");
        if (post.site.manned) news(s, raw(txt("§7"), t("bannerforge.people.replaced", soldierTitle(post.kind, rank)), txt(" "), buildingName(post.id)));
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

const P_DUTY = "bannerforge:duty";

/**
 * Where a garrison soldier serves (2026-11-19: they used to crowd the barracks door). The soldier's post is where it
 * is spawned (its home). Watchtower archer: on top of the tower. Barracks: one at the door, one patrolling the town,
 * the others at the border on the four sides. Keep: one at the door, one at the bell. Falls back to the door while a
 * spot isn't loaded.
 */
function dutyOf(dim: Dimension, s: Settlement, post: Post, n: number, door: Vector3): { at: Vector3; patrol: boolean } {
  if (post.kind === "ranged") return { at: towerTop(dim, post.site) ?? door, patrol: false };
  if (post.id === "keep") return { at: n === 0 ? door : (standOn(dim, s.center.x + 2, s.center.z) ?? door), patrol: false };
  if (n === 0) return { at: door, patrol: false };
  if (n === 1) return { at: door, patrol: true };
  // Border watch: four sides at 80 % of the border, spread over the barracks.
  const r = Math.floor(BORDER_RADIUS[tier(s)] * 0.8);
  const sides = [[0, -r], [r, 0], [0, r], [-r, 0]];
  const [dx, dz] = sides[(post.index * 2 + n - 2) % 4];
  return { at: standOn(dim, s.center.x + dx, s.center.z + dz) ?? door, patrol: false };
}

/** The top of a tower: the highest spot with room to stand inside the site's middle (archers shoot from there). */
function towerTop(dim: Dimension, site: Site): Vector3 | undefined {
  const w = site.w;
  const d = site.d ?? site.w;
  const mid = toWorld({ x: site.x, z: site.z, w, d, rot: site.rot }, Math.floor((w - 1) / 2), Math.floor((d - 1) / 2));
  try {
    for (let y = site.y + 24; y > site.y + 2; y--) {
      const ground = dim.getBlock({ x: mid.x, y: y - 1, z: mid.z });
      const feet = dim.getBlock({ x: mid.x, y, z: mid.z });
      const head = dim.getBlock({ x: mid.x, y: y + 1, z: mid.z });
      if (ground && feet && head && !ground.isAir && !ground.isLiquid && feet.isAir && head.isAir) return { x: mid.x + 0.5, y, z: mid.z + 0.5 };
    }
  } catch {
    // not loaded
  }
  return undefined;
}

/** Standing spot on the ground at x, z (undefined while not loaded or in water). */
function standOn(dim: Dimension, x: number, z: number): Vector3 | undefined {
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top || top.isLiquid) return undefined;
    return { x: x + 0.5, y: top.location.y + 1, z: z + 0.5 };
  } catch {
    return undefined;
  }
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
  return doorOfSite(dim, post.site);
}

/** Just outside the middle of a site's entrance, on the first free spot from the ground up (also the Town Hall). */
export function doorOfSite(dim: Dimension, site: Site): Vector3 | undefined {
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
