// Visible townsfolk, prototype (M2.5 step 2, owner 2026-11-18). One NPC type for every person in a settlement:
// settlers, workers, garrisons, and later vanilla villagers converted to our look (owner: villagers and settlers will
// look the same, illager-like with moving arms). Role, rank, profession and faction look are entity properties, so the
// art and the conversion plug in without a new entity type.
//
// Settlers and workers run the vanilla village routine (minecraft:dweller + a scheduler like villager_v2): they claim
// beds, gather around midday, go home in the evening and sleep at night. A mob's home is where it appeared, so a
// worker spawned at its workplace spends working hours there; a guard stays at its post and fights monsters.

import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { pickName } from "./npc.js";
import { OUTFIT_INDEX } from "./types.js";

export const CITIZEN_ID = "bannerforge_settlements:citizen";
export type CitizenRole = "settler" | "worker" | "guard";
/** Name tag titles (plain text, as the steward's). Real professions and ranks replace these later. */
const ROLE_TITLE: Record<CitizenRole, string> = { settler: "Settler", worker: "Worker", guard: "Militiaman" };

/** Spawns a citizen with a role, the faction's look and a name ("Settler, Edric"). */
export function spawnCitizen(dim: Dimension, at: Vector3, role: CitizenRole, faction: string, seed: string): Entity {
  const e = dim.spawnEntity(CITIZEN_ID, at);
  e.triggerEvent(`bannerforge:become_${role}`);
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

