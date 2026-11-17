// Townsfolk, step 1: numbers only (M2.5, owner rules 2026-11-17). Visible NPCs come in step 2.
// - Settlers arrive at dawn into every free bed (never at evening or night: it's safer for them). A house finished
//   in the evening fills the next morning.
// - Free settlers take open jobs automatically, any time of day. A worker keeps their profession while the
//   workplace stands; if it's gone, they are free again.
// - When people outnumber beds, the unemployed leave first at dawn, then the newest workers.
// Pure rules live in rules.ts (unit-tested); this file runs them on the in-game clock and tells nearby players.

import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { BORDER_RADIUS } from "./plots.js";
import { gameTime } from "./clock.js";
import { allSettlements, saveSettlement } from "./registry.js";
import { assignJobs, citizensOf, freeBeds, morning, tier } from "./rules.js";
import { buildingName, raw, t, txt } from "./text.js";
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

/** Runs a dawn if one is due, then fills open jobs. Saves and tells players when something changed. */
export function update(s: Settlement, force = false): void {
  const c = citizensOf(s);
  const now = gameTime();
  const day = Math.floor(now / 24000);
  const tod = now % 24000;
  const news: RawMessage[] = [];

  if (force || ((c.day ?? -1) < day && tod >= DAWN && tod < DUSK)) {
    c.day = day;
    const { arrived, left } = morning(s);
    if (arrived === 1) news.push(raw(txt("§a"), t("bannerforge.citizens.arrived_one", s.name)));
    else if (arrived) news.push(raw(txt("§a"), t("bannerforge.citizens.arrived", String(arrived), s.name)));
    if (left === 1) news.push(raw(txt("§6"), t("bannerforge.citizens.left_one", s.name)));
    else if (left) news.push(raw(txt("§6"), t("bannerforge.citizens.left", String(left), s.name)));
    if (!arrived && !left) saveSettlement(s); // remember the day
  }
  const hired = assignJobs(s);
  for (const id of hired) news.push(raw(txt("§7"), t("bannerforge.citizens.hired", s.name), txt(" "), buildingName(id)));
  if (!news.length) return;
  saveSettlement(s);
  for (const p of playersIn(s)) for (const m of news) p.sendMessage(m);
}

/** Players inside (or just around) the settlement's border. */
function playersIn(s: Settlement): Player[] {
  try {
    const r = BORDER_RADIUS[tier(s)] + 32;
    return world
      .getDimension(s.dimension)
      .getPlayers()
      .filter((p) => Math.max(Math.abs(p.location.x - s.center.x), Math.abs(p.location.z - s.center.z)) <= r);
  } catch {
    return [];
  }
}

/** Developer: one settler arrives now, if there is a free bed. Returns false when every bed is taken. */
export function addSettlerNow(s: Settlement): boolean {
  if (freeBeds(s) <= 0) return false;
  citizensOf(s).free += 1;
  saveSettlement(s);
  update(s);
  return true;
}
