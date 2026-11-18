// Visible townsfolk, prototype (M2.5 step 2, owner 2026-11-18). One NPC type for every person in a settlement:
// settlers, workers, garrisons, and later vanilla villagers converted to our look (owner: villagers and settlers will
// look the same, illager-like with moving arms). Role, rank, profession and faction look are entity properties, so the
// art and the conversion plug in without a new entity type.
//
// The citizen is the full vanilla villager_v2 under our identifier (tools/make_citizen.mjs; lab 2026-11-18), so
// settlers and workers get the whole village routine: they claim a bed, take a free vanilla job block, trade and keep
// the daily schedule. A guard stays at its post and fights monsters. Citizens are born straight into their role
// (spawn event): in the lab, citizens spawned that way settled in fastest; changing a role later works but is slower.

import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { pickName } from "./npc.js";
import { OUTFIT_INDEX } from "./types.js";

export const CITIZEN_ID = "bannerforge_settlements:citizen";
export type CitizenRole = "settler" | "worker" | "guard";
/** Name tag titles (plain text, as the steward's). Real professions and ranks replace these later. */
const ROLE_TITLE: Record<CitizenRole, string> = { settler: "Settler", worker: "Worker", guard: "Militiaman" };

/** Spawns a citizen with a role, the faction's look and a name ("Settler, Edric"). */
export function spawnCitizen(dim: Dimension, at: Vector3, role: CitizenRole, faction: string, seed: string): Entity {
  const e = dim.spawnEntity(CITIZEN_ID, at, { spawnEvent: `bannerforge:spawn_${role}` });
  try {
    e.setProperty("bannerforge_settlements:outfit", OUTFIT_INDEX[faction as keyof typeof OUTFIT_INDEX] ?? 0);
  } catch (err) {
    console.warn(`[BannerForge] citizen outfit: ${String(err)}`);
  }
  e.addTag("bannerforge:citizen");
  // Name tags are plain text (like the steward's "Steward, Edric"); titles follow the owner's NPC naming rule.
  e.nameTag = `${ROLE_TITLE[role]}, ${pickName(seed + role)}`;
  e.setDynamicProperty("bannerforge:role", role);
  return e;
}

