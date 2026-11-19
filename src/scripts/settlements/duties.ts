// Soldier duties (owner 2026-11-19): the Captain fills every soldier slot with a duty, and the player can change any of
// them on the Captain's duty board. A slot is `<post tag>:<duty index>`, so a replacement takes the fallen one's duty.
// Pure module (unit-tested): no @minecraft imports.

import { posts, type Post } from "./rules.js";
import type { Role, Settlement } from "./types.js";

export const slotKey = (postTag: string, n: number): string => `${postTag}:${n}`;

/**
 * The Captain's own choice. Watchtower: archer on the tower. Keep: one at its door, one at the bell. Barracks: one
 * guards the barracks, one patrols the town, the rest hold the town entrances (or the border when there are no paths in).
 */
export function defaultRole(post: Pick<Post, "id" | "kind">, n: number, hasGates: boolean): Role {
  if (post.kind === "ranged") return "tower";
  if (post.id === "keep") return n === 0 ? "barracks" : "bell";
  if (n === 0) return "barracks";
  if (n === 1) return "patrol";
  return hasGates ? "gate" : "border";
}

/** Duties the duty board offers for a soldier of this post. */
export function rolesFor(post: Pick<Post, "id" | "kind">): Role[] {
  if (post.kind === "ranged") return ["tower", "gate", "border", "barracks"];
  if (post.id === "keep") return ["barracks", "bell", "gate", "border", "patrol"];
  return ["barracks", "gate", "border", "patrol"];
}

/**
 * How far a soldier may chase from his post before he gives up and goes back (owner 2026-11-19: per role). The town
 * patrol is measured from the bell instead: up to the border + 8.
 */
export const LEASH: Record<Role, number> = { gate: 16, border: 24, patrol: 8, barracks: 16, tower: 14, bell: 16, captain: 10 };

/** How far a soldier wanders from his post when nothing is going on (the entity's home radius for that duty). */
export const WANDER: Record<Role, number> = { gate: 12, border: 20, patrol: 40, barracks: 12, tower: 12, bell: 12, captain: 4 };

export interface Slot {
  key: string;
  post: Post;
  n: number;
  role: Role;
}

/** Every soldier slot of the settlement with its duty (the player's choice, else the Captain's). */
export function slots(s: Settlement, postTag: (p: Post) => string): Slot[] {
  const hasGates = (s.gates?.length ?? 0) > 0;
  const out: Slot[] = [];
  for (const post of posts(s)) {
    for (let n = 0; n < post.count; n++) {
      const key = slotKey(postTag(post), n);
      let role = s.duties?.[key] ?? defaultRole(post, n, hasGates);
      if (!rolesFor(post).includes(role)) role = defaultRole(post, n, hasGates);
      if (role === "gate" && !hasGates) role = "border";
      out.push({ key, post, n, role });
    }
  }
  return out;
}

/** Which of the soldiers sharing a duty this slot is (spreads gate and border guards over the spots). */
export function placeIndex(all: Slot[], key: string): number {
  const me = all.find((x) => x.key === key);
  if (!me) return 0;
  return all.filter((x) => x.role === me.role).findIndex((x) => x.key === key);
}

/** The player's choice for a slot; choosing the Captain's default again clears it. */
export function setDuty(s: Settlement, key: string, role: Role | undefined): void {
  const duties = { ...(s.duties ?? {}) };
  if (role) duties[key] = role;
  else delete duties[key];
  s.duties = Object.keys(duties).length ? duties : undefined;
}
