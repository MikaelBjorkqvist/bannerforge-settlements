// Turning a vanilla villager into a citizen (owner 2026-11-18): only for our settlements, keep the profession and
// the looks, no warning. The citizen is the full villager_v2 under our identifier (tools/make_citizen.mjs), so after
// the swap it keeps living the vanilla day. What can't be carried over: the trade list and trade level (scripts can't
// read them), so a converted villager offers fresh trades of the same profession.

import { type Entity } from "@minecraft/server";
import { CITIZEN_ID } from "./citizen_npc.js";

export const VILLAGER_ID = "minecraft:villager_v2";

/** The vanilla job variant of a villager (0 none, 14 nitwit). */
export const jobOf = (v: Entity): number => v.getComponent("minecraft:variant")?.value ?? 0;

/** Job variant → the event that gives a citizen that job (vanilla's own events; 3 is spelled "sheperd" there). */
const JOB_EVENT: Record<number, string> = {
  0: "minecraft:become_unskilled",
  1: "minecraft:become_farmer",
  2: "minecraft:become_fisherman",
  3: "minecraft:become_sheperd",
  4: "minecraft:become_fletcher",
  5: "minecraft:become_librarian",
  6: "minecraft:become_cartographer",
  7: "minecraft:become_cleric",
  8: "minecraft:become_armorer",
  9: "minecraft:become_weaponsmith",
  10: "minecraft:become_toolsmith",
  11: "minecraft:become_butcher",
  12: "minecraft:become_leatherworker",
  13: "minecraft:become_mason",
  14: "bannerforge:become_nitwit",
};
/** Biome outfit (mark_variant) → our look event; 0 is the plains outfit, the default. */
const LOOK_EVENT: Record<number, string> = {
  1: "bannerforge:look_desert",
  2: "bannerforge:look_jungle",
  3: "bannerforge:look_savanna",
  4: "bannerforge:look_snow",
  5: "bannerforge:look_swamp",
  6: "bannerforge:look_taiga",
};

/** Gives citizen `to` the skin and biome outfit of `from` (villager or citizen). */
export function copyLook(from: Entity, to: Entity): void {
  const look = from.getComponent("minecraft:mark_variant")?.value ?? 0;
  const skin = from.getComponent("minecraft:skin_id")?.value ?? 0;
  to.triggerEvent(`bannerforge:skin_${skin}`);
  if (LOOK_EVENT[look]) to.triggerEvent(LOOK_EVENT[look]);
}

/**
 * Replaces a vanilla villager with a citizen with the same job, skin, outfit, name and age. The citizen is spawned
 * before the villager goes, so a failure (e.g. a chunk that is loaded but not ticking) leaves the villager as it was.
 */
export function convertVillager(v: Entity): Entity | undefined {
  if (v.typeId !== VILLAGER_ID || !v.isValid) return undefined;
  const job = v.getComponent("minecraft:variant")?.value ?? 0;
  const look = v.getComponent("minecraft:mark_variant")?.value ?? 0;
  const skin = v.getComponent("minecraft:skin_id")?.value ?? 0;
  const baby = v.getComponent("minecraft:is_baby") !== undefined;
  const { dimension, location } = v;
  const rotation = v.getRotation();
  const name = v.nameTag;

  const c = dimension.spawnEntity(CITIZEN_ID, location, {
    spawnEvent: baby ? "bannerforge:spawn_converted_baby" : "bannerforge:spawn_converted",
  });
  v.remove();
  c.setRotation(rotation);
  c.triggerEvent(`bannerforge:skin_${skin}`);
  if (LOOK_EVENT[look]) c.triggerEvent(LOOK_EVENT[look]);
  if (!baby) c.triggerEvent(JOB_EVENT[job] ?? JOB_EVENT[0]);
  if (name) c.nameTag = name;
  c.addTag("bannerforge:citizen");
  return c;
}
