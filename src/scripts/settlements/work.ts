// Workers live at their workplace (owner 2026-11-19: they roam within 8 blocks of their building by day). The
// behaviour file does the roaming (citizen.json at_work: home + go_home, day plan worker_schedule); the script only
// makes the workplace door the worker's home, by spawning him there and letting him walk over (walk.ts).

import { type Entity, world } from "@minecraft/server";
import { CITIZEN_ID } from "./citizen_npc.js";
import { copyLook } from "./convert.js";
import { doorOfSite } from "./garrison.js";
import { jobBuilding } from "./roster.js";
import type { Person, Settlement } from "./types.js";
import { walkFrom } from "./walk.js";

/** The job slot this worker's entity was given a home at. */
export const P_WORKPLACE = "bannerforge:workplace";

/**
 * Version of the workplace home: workers sent before 2026-11-19 (v1) got no home spot saved and are sent again.
 */
const HOME_VERSION = 2;
const workplaceKey = (job: string) => `${job}@${HOME_VERSION}`;

/** Does this worker's entity still need a home at his workplace? */
export const needsWorkplace = (e: Entity, p: Person): boolean => !!p.job && e.getDynamicProperty(P_WORKPLACE) !== workplaceKey(p.job);

/**
 * Makes a citizen a worker living at his workplace: a worker entity with the same look, name, tags and data is
 * spawned at the building's door and walks over from where the old one stood. Updates `p.eid`; the caller saves.
 * Falls back to a plain role change while the building's chunk isn't loaded.
 */
export function sendToWork(s: Settlement, p: Person, old: Entity): Entity {
  if (!p.job) return old;
  const building = jobBuilding(p.job);
  const index = Number(p.job.slice(p.job.lastIndexOf(":") + 1));
  const site = s.sites?.[building]?.[index];
  const dim = world.getDimension(s.dimension);
  const door = site ? doorOfSite(dim, site) : undefined;
  if (!door) {
    if (old.getProperty("bannerforge_settlements:role") !== "worker") old.triggerEvent("bannerforge:become_worker");
    return old;
  }
  const from = old.location;
  const e = dim.spawnEntity(CITIZEN_ID, door, { spawnEvent: "bannerforge:spawn_worker" });
  copyLook(old, e);
  try {
    e.setProperty("bannerforge_settlements:outfit", Number(old.getProperty("bannerforge_settlements:outfit")) || 0);
  } catch {
    // no outfit property
  }
  e.nameTag = old.nameTag;
  for (const tag of old.getTags()) e.addTag(tag);
  for (const id of old.getDynamicPropertyIds()) e.setDynamicProperty(id, old.getDynamicProperty(id));
  e.setDynamicProperty(P_WORKPLACE, workplaceKey(p.job));
  e.setRotation(old.getRotation());
  walkFrom(e, from, door);
  old.remove();
  p.eid = e.id;
  return e;
}
