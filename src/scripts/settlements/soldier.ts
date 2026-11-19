// Garrison soldiers (owner 2026-11-18): their own entity, not villagers. Illager-like look later (placeholder: the
// steward model in faction colours); weapons and armour from our gear lists; ranks Militia → Soldier → Knight for
// melee and Archer → Marksman → Ranger for ranged. Built from vanilla parts (BP/entities/soldier.json): the iron
// golem's village-defender role, the vindicator's melee attack and the skeleton's bow. Its post is where it spawned.

import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { pickName } from "./npc.js";
import { OUTFIT_INDEX } from "./types.js";

export const SOLDIER_ID = "bannerforge_settlements:soldier";
export type SoldierKind = "melee" | "ranged";
/** Name tag titles by kind and rank (plain text like the steward's; lang keys come with the real UI). */
const TITLES: Record<SoldierKind, string[]> = {
  melee: ["Militiaman", "Soldier", "Knight"],
  ranged: ["Archer", "Marksman", "Ranger"],
};

/** The garrison's leader, who keeps the duty board (owner 2026-11-19). */
export const CAPTAIN_TITLE = "Captain";

export const soldierTitle = (kind: SoldierKind, rank: 1 | 2 | 3): string => TITLES[kind][rank - 1];

/** Spawns a soldier of a kind and rank in the faction's colours, with a name ("Militiaman, Edric"). */
export function spawnSoldier(
  dim: Dimension,
  at: Vector3,
  kind: SoldierKind,
  faction: string,
  seed: string,
  rank: 1 | 2 | 3 = 1,
): Entity {
  const e = dim.spawnEntity(SOLDIER_ID, at, { spawnEvent: `bannerforge:spawn_${kind}` });
  if (rank > 1) e.triggerEvent(`bannerforge:rank_${rank}`);
  try {
    e.setProperty("bannerforge_settlements:outfit", OUTFIT_INDEX[faction as keyof typeof OUTFIT_INDEX] ?? 0);
  } catch (err) {
    console.warn(`[BannerForge] soldier outfit: ${String(err)}`);
  }
  e.nameTag = `${soldierTitle(kind, rank)}, ${pickName(seed + kind)}`;
  return e;
}
