// The walk-in trick (lab 2026-11-18): an entity's home is where it is spawned, and go_home brings it back there. To
// send someone to a new spot, spawn them there and move them back to where they stood in the same tick: they walk
// over. Pathfinding gives up on long trips, so from further than WALK_MAX they start part of the way.

import { type Entity, type Vector3 } from "@minecraft/server";

export const WALK_MAX = 40;

/** Moves a freshly spawned entity (whose home is `home`) to where it should walk from. */
export function walkFrom(e: Entity, from: Vector3, home: Vector3): void {
  const d = Math.hypot(from.x - home.x, from.z - home.z);
  if (d <= WALK_MAX) {
    e.teleport(from);
    return;
  }
  const k = WALK_MAX / d;
  const x = home.x + (from.x - home.x) * k;
  const z = home.z + (from.z - home.z) * k;
  let y = from.y;
  try {
    y = (e.dimension.getTopmostBlock({ x, z })?.location.y ?? from.y - 1) + 1;
  } catch {
    // not loaded: keep the height he had
  }
  e.teleport({ x, y, z });
}
