// Townsfolk (M2.5, owner rules 2026-11-17): the numbers. Step 2 (2026-11-18): people.ts turns them into named people
// who walk in from the border; this file runs the rules and then lets the roster follow (syncPeople).
// - Settlers arrive at dawn into every free bed (never at evening or night: it's safer for them). A house finished
//   in the evening fills the next morning.
// - Free settlers take open jobs automatically, any time of day. A worker keeps their profession while the
//   workplace stands; if it's gone, they are free again.
// - When people outnumber beds, the unemployed leave first at dawn, then the newest workers.
// Pure rules live in rules.ts (unit-tested); this file runs them on the in-game clock and tells nearby players.

import { system, world } from "@minecraft/server";
import { gameTime } from "./clock.js";
import { news, syncPeople } from "./people.js";
import { allSettlements, saveSettlement } from "./registry.js";
import { addChild, growUp } from "./roster.js";
import { assignJobs, citizensOf, freeBeds, morning } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

/** Settlers arrive after sunrise, from 7:00 (tick 1000 of the day)... */
const DAWN = 1000;
/** ...until dusk (18:00), so a day that started while nobody was around still brings them. */
const DUSK = 12000;
const INTERVAL = 40;

export function registerCitizens(): void {
  // World data can't be read while scripts first load: start on the first tick.
  system.runInterval(() => {
    for (const s of allSettlements()) update(s);
  }, INTERVAL);
}

/** Runs a dawn if one is due, fills open jobs, then brings the named people in line. Saves when something changed. */
export function update(s: Settlement, force = false): void {
  const c = citizensOf(s);
  const now = gameTime();
  const day = Math.floor(now / 24000);
  const tod = now % 24000;
  let changed = false;
  if (force || ((c.day ?? -1) < day && tod >= DAWN && tod < DUSK)) {
    c.day = day;
    // Children born yesterday or earlier are grown: free settlers from now on (owner 2026-11-18).
    for (const p of growUp(s, day)) {
      const e = p.eid ? world.getEntity(p.eid) : undefined;
      e?.triggerEvent("bannerforge:become_settler");
      news(s, raw(txt("§7"), t("bannerforge.people.grown", p.name)));
    }
    const { births } = morning(s);
    for (let i = 0; i < births; i++) addChild(s, day); // growth.ts gives them their entity in a house
    changed = true;
  }
  if (assignJobs(s).length) changed = true;
  if (syncPeople(s)) changed = true;
  if (changed) saveSettlement(s);
}

/** Developer: one settler arrives now, if there is a free bed. Returns false when every bed is taken. */
export function addSettlerNow(s: Settlement): boolean {
  if (freeBeds(s) <= 0) return false;
  citizensOf(s).free += 1;
  saveSettlement(s);
  update(s);
  return true;
}
