// Raid mode (owner 2026-11-19: "what happens at raids"). A town is under attack while 3 or more raiders (illagers,
// ravagers, witches) are inside its border. Then every soldier hunts raiders anywhere in town (soldier.json raid
// group: a wider home area and raiders as first targets), and the town hears about it. The raid is over when no raider has been inside for 30 seconds; the
// soldiers walk back to their duties.
//
// Performance (CLAUDE.md rule 6): one pass every 5 seconds, one entity query per loaded town.

import { system, world } from "@minecraft/server";
import { news } from "./people.js";
import { BORDER_RADIUS } from "./plots.js";
import { allSettlements } from "./registry.js";
import { tier } from "./rules.js";
import { SOLDIER_ID } from "./soldier.js";
import { raw, t } from "./text.js";
import type { Settlement } from "./types.js";

const INTERVAL = 100;
const START_AT = 3;
const CALM_TICKS = 600;
const RAIDERS = ["illager", "ravager", "witch"];

/** Towns under attack: settlement id -> tick a raider was last seen inside. */
const underAttack = new Map<string, number>();

export function registerRaids(): void {
  system.runInterval(() => {
    for (const s of allSettlements()) {
      try {
        check(s);
      } catch (err) {
        console.warn(`[BannerForge] raid ${s.name}: ${String(err)}`);
      }
    }
  }, INTERVAL);
}

function raidersIn(s: Settlement): number {
  const dim = world.getDimension(s.dimension);
  const r = BORDER_RADIUS[tier(s)];
  let n = 0;
  for (const family of RAIDERS) {
    for (const e of dim.getEntities({ families: [family], location: s.center, maxDistance: r * 1.42 })) {
      if (Math.abs(e.location.x - s.center.x) <= r && Math.abs(e.location.z - s.center.z) <= r) n++;
    }
  }
  return n;
}

function check(s: Settlement): void {
  const now = system.currentTick;
  const n = raidersIn(s);
  const on = underAttack.has(s.id);
  if (!on && n >= START_AT) {
    underAttack.set(s.id, now);
    news(s, raw({ text: "§c" }, t("bannerforge.raid.start", s.name)));
    soldiers(s, "bannerforge:raid_start");
  } else if (on && n > 0) {
    underAttack.set(s.id, now);
    soldiers(s, "bannerforge:raid_start"); // newcomers and replacements join in
  } else if (on && now - (underAttack.get(s.id) ?? now) >= CALM_TICKS) {
    underAttack.delete(s.id);
    news(s, raw({ text: "§a" }, t("bannerforge.raid.over", s.name)));
    soldiers(s, "bannerforge:raid_end");
  }
}

function soldiers(s: Settlement, event: string): void {
  const dim = world.getDimension(s.dimension);
  for (const e of dim.getEntities({ type: SOLDIER_ID, location: s.center, maxDistance: BORDER_RADIUS[tier(s)] + 40 })) {
    e.triggerEvent(event);
  }
}
