// Town entrances (owner 2026-11-19: gate duty). Until towns have walls and real gates, an entrance is where a path
// crosses the border: the scan walks a ring just inside the border and groups path blocks into entrances. Once a day
// per settlement, spread over ticks (system.runJob), and only kept when the whole ring was loaded.

import { type Dimension, system, world } from "@minecraft/server";
import { gameTime } from "./clock.js";
import { BORDER_RADIUS } from "./plots.js";
import { saveSettlement, settlementById } from "./registry.js";
import { tier } from "./rules.js";
import type { Settlement } from "./types.js";

const PATHS = new Set(["minecraft:grass_path", "minecraft:dirt_path"]);
/** How far inside the border the ring runs. */
const INSET = 3;
const scanning = new Set<string>();
/** When a scan last started, per settlement (a scan that found part of the ring unloaded waits a minute). */
const lastTry = new Map<string, number>();
const RETRY_TICKS = 1200;

/** Starts today's scan for a settlement if it hasn't run yet. */
export function updateGates(s: Settlement): void {
  const day = Math.floor(gameTime() / 24000);
  if (s.gatesDay === day || scanning.has(s.id)) return;
  if (system.currentTick - (lastTry.get(s.id) ?? -RETRY_TICKS) < RETRY_TICKS) return;
  lastTry.set(s.id, system.currentTick);
  scanning.add(s.id);
  system.runJob(scan(world.getDimension(s.dimension), s, day));
}

function* scan(dim: Dimension, s: Settlement, day: number): Generator<void, void, void> {
  const h = BORDER_RADIUS[tier(s)] - INSET;
  const cx = s.center.x;
  const cz = s.center.z;
  // The ring in order (clockwise from the north-west corner), so neighbouring path blocks follow each other.
  const ring: [number, number][] = [];
  for (let x = cx - h; x < cx + h; x++) ring.push([x, cz - h]);
  for (let z = cz - h; z < cz + h; z++) ring.push([cx + h, z]);
  for (let x = cx + h; x > cx - h; x--) ring.push([x, cz + h]);
  for (let z = cz + h; z > cz - h; z--) ring.push([cx - h, z]);

  const hits: number[] = [];
  let unloaded = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i];
    try {
      const top = dim.getTopmostBlock({ x, z });
      if (top && PATHS.has(top.typeId)) hits.push(i);
    } catch {
      unloaded++;
    }
    if (i % 16 === 15) yield;
  }
  scanning.delete(s.id);

  // Neighbouring hits (up to 3 apart) are one entrance; its spot is the middle one.
  const gates: { x: number; z: number }[] = [];
  let group: number[] = [];
  const close = () => {
    if (group.length) {
      const [x, z] = ring[group[Math.floor(group.length / 2)]];
      gates.push({ x, z });
    }
    group = [];
  };
  for (const i of hits) {
    if (group.length && i - group[group.length - 1] > 3) close();
    group.push(i);
  }
  close();

  const fresh = settlementById(s.id);
  if (!fresh) return;
  if (unloaded > ring.length / 10) {
    // Part of the ring wasn't loaded: try again later today, keep what we had.
    return;
  }
  fresh.gates = gates;
  fresh.gatesDay = day;
  saveSettlement(fresh);
}
