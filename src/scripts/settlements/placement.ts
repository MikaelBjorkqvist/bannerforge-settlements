// Placing a building (owner decisions, 2026-11-15): the plot follows the player inside the town border,
// its entrance facing the player. Green = can build, orange = a vanilla house is cleared for a fee,
// red = blocked (with the reason). Tap Sneak for the panel: Build, Rotate, Move, Cancel.

import { MolangVariableMap, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { buildingById, type BuildingDef, type Cost } from "./buildings.js";
import { refreshActiveSites, startConstruction } from "./construction.js";
import { canAfford, pay } from "./economy.js";
import { BORDER_RADIUS, PLACEHOLDER_HEIGHT, PLOT_WIDTH, borderPointsNear, footprintInFront, insideBorder, turn, type Footprint } from "./plots.js";
import { saveSettlement, settlementById } from "./registry.js";
import { check, tier } from "./rules.js";
import { survey, type Survey } from "./terrain.js";
import { buildingName, costText, raw, reasonText, say, t, txt } from "./text.js";
import type { BuildingLevel, Settlement, Site } from "./types.js";

/** Emeralds the steward asks to clear a vanilla house (placeholder price). */
export const CLEAR_FEE = 5;
const PARTICLE = "bannerforge_settlements:marker";
const TICK = 2;
/** A Sneak press shorter than this (ticks) is a tap. */
const TAP_TICKS = 8;
/** Placement ends if the player wanders this far from the bell. */
const GIVE_UP_DISTANCE = 160;

export type PlaceMode =
  | { kind: "new"; cost: Cost[] } // a new building or house: pay on Build
  | { kind: "existing"; index: number }; // bought before M2a, not placed yet: free

interface Placing {
  sid: string;
  defId: string;
  mode: PlaceMode;
  w: number;
  topHeight: number;
  turns: number;
  locked?: Footprint;
  current?: Footprint;
  surveyed?: Survey;
  surveyedKey?: string;
  sneakSince?: number;
  wasSneaking: boolean;
  panelOpen: boolean;
  age: number;
}

const placing = new Map<string, Placing>();
let loop: number | undefined;

export const isPlacing = (player: Player) => placing.has(player.id);

export function startPlacement(player: Player, s: Settlement, def: BuildingDef, mode: PlaceMode): void {
  if (def.plot === "perimeter") return;
  placing.set(player.id, {
    sid: s.id,
    defId: def.id,
    mode,
    w: PLOT_WIDTH[def.plot],
    topHeight: PLACEHOLDER_HEIGHT[def.plot][2],
    turns: 0,
    wasSneaking: player.isSneaking,
    panelOpen: false,
    age: 0,
  });
  player.sendMessage(raw(t("bannerforge.place.start"), txt(" "), buildingName(def.id)));
  player.sendMessage(raw(txt("§7"), t("bannerforge.place.how")));
  loop ??= system.runInterval(tick, TICK);
}

function stop(player: Player | undefined, id: string, messageKey?: string): void {
  placing.delete(id);
  if (player && messageKey) say(player, messageKey);
  if (!placing.size && loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
}

// ---------- the loop ----------

function tick(): void {
  for (const [id, p] of placing) {
    const player = world.getEntity(id) as Player | undefined;
    if (!player?.isValid) {
      stop(undefined, id);
      continue;
    }
    if (p.panelOpen) continue;
    const s = settlementById(p.sid);
    if (!s || player.dimension.id !== s.dimension) {
      stop(player, id, "bannerforge.place.cancelled");
      continue;
    }
    const d = Math.hypot(player.location.x - s.center.x, player.location.z - s.center.z);
    if (d > GIVE_UP_DISTANCE) {
      stop(player, id, "bannerforge.place.cancelled");
      continue;
    }
    p.age += TICK;

    // Sneak tap opens the panel.
    const sneaking = player.isSneaking;
    if (sneaking && !p.wasSneaking) p.sneakSince = system.currentTick;
    if (!sneaking && p.wasSneaking && p.sneakSince !== undefined && system.currentTick - p.sneakSince <= TAP_TICKS) {
      p.wasSneaking = sneaking;
      openPanel(player, p);
      continue;
    }
    p.wasSneaking = sneaking;

    if (p.age % 6 !== 0) continue;
    const f = p.locked ?? footprintAhead(player, p);
    p.current = f;
    const key = `${f.x},${f.z},${f.rot}`;
    if (key !== p.surveyedKey) {
      p.surveyed = runSurvey(s, p, f);
      p.surveyedKey = key;
    }
    draw(player, s, p, f, p.surveyed!);
    if (p.age % 12 === 0) player.onScreenDisplay.setActionBar(statusLine(p, p.surveyed!, true));
  }
}

function footprintAhead(player: Player, p: Placing): Footprint {
  const v = player.getViewDirection();
  return footprintInFront(player.location.x, player.location.z, v.x, v.z, p.w, p.turns);
}

function otherFootprints(s: Settlement): Footprint[] {
  const list: Footprint[] = [];
  for (const sites of Object.values(s.sites ?? {})) for (const site of sites) if (site) list.push({ x: site.x, z: site.z, w: site.w, rot: site.rot });
  return list;
}

function runSurvey(s: Settlement, p: Placing, f: Footprint): Survey {
  return survey({
    dim: world.getDimension(s.dimension),
    f,
    topHeight: p.topHeight,
    bell: s.center,
    insideBorder: insideBorder(f, s.center.x, s.center.z, BORDER_RADIUS[tier(s)]),
    others: otherFootprints(s),
  });
}

// ---------- drawing ----------

type RGB = { red: number; green: number; blue: number };
const GREEN: RGB = { red: 0.2, green: 1, blue: 0.25 };
const ORANGE: RGB = { red: 1, green: 0.6, blue: 0.05 };
const RED: RGB = { red: 1, green: 0.15, blue: 0.1 };
const WHITE: RGB = { red: 0.85, green: 0.85, blue: 0.9 };
const GOLD: RGB = { red: 1, green: 0.85, blue: 0.2 };

function particle(dim: ReturnType<typeof world.getDimension>, x: number, y: number, z: number, color: RGB): void {
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", color);
  try {
    dim.spawnParticle(PARTICLE, { x, y, z }, vars);
  } catch {
    // outside loaded chunks
  }
}

function outline(dim: ReturnType<typeof world.getDimension>, f: Footprint, y: number, color: RGB, spacing: number): void {
  for (let i = 0; i <= f.w; i += spacing) {
    particle(dim, f.x + i, y, f.z, color);
    particle(dim, f.x + i, y, f.z + f.w, color);
    particle(dim, f.x, y, f.z + i, color);
    particle(dim, f.x + f.w, y, f.z + i, color);
  }
}

function draw(player: Player, s: Settlement, p: Placing, f: Footprint, sv: Survey): void {
  const dim = player.dimension;
  const y = (sv.groundY || Math.floor(player.location.y) - 1) + 1.1;
  const color = sv.verdict === "ok" ? GREEN : sv.verdict === "clear" ? ORANGE : RED;
  outline(dim, f, y, color, 1);
  // Entrance arrow: three dots leading out of the front edge.
  const STEPS: Record<number, [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };
  const [sx, sz] = STEPS[f.rot];
  const cx = f.x + f.w / 2;
  const cz = f.z + f.w / 2;
  for (let k = 0; k < 3; k++) {
    const r = f.w / 2 + 0.5 + k;
    particle(dim, cx + sx * r, y + 0.2, cz + sz * r, color);
  }
  // The settlement's other buildings.
  for (const o of otherFootprints(s)) {
    if (Math.hypot(o.x - player.location.x, o.z - player.location.z) < 48) outline(dim, o, y, WHITE, 2);
  }
  // Nearby part of the town border.
  showBorderNear(player, s, y);
}

function showBorderNear(player: Player, s: Settlement, y: number): void {
  const r = BORDER_RADIUS[tier(s)];
  for (const pt of borderPointsNear(s.center.x, s.center.z, r, player.location.x, player.location.z, 28, 2)) particle(player.dimension, pt.x, y, pt.z, GOLD);
}

/** "Show town border" from the ledger: the border near the player, for 30 seconds. */
export function showBorder(player: Player, s: Settlement): void {
  say(player, "bannerforge.border.showing");
  let runs = 0;
  const id = system.runInterval(() => {
    if (!player.isValid || ++runs > 60) {
      system.clearRun(id);
      return;
    }
    showBorderNear(player, s, player.location.y + 0.2);
  }, 10);
}

// ---------- text ----------

function statusLine(p: Placing, sv: Survey, withHelp: boolean): RawMessage {
  const parts: RawMessage[] = [];
  if (sv.verdict === "ok") parts.push(t("bannerforge.place.ok"));
  else if (sv.verdict === "clear") parts.push(t("bannerforge.place.clear", String(CLEAR_FEE)));
  else parts.push(t(`bannerforge.place.reason.${sv.reason ?? "unloaded"}`));
  if (withHelp) parts.push(txt("§r  ·  §7"), t(p.locked ? "bannerforge.place.bar_locked" : "bannerforge.place.bar_follow"));
  return raw(...parts);
}

function totalCost(p: Placing, sv: Survey): Cost[] {
  const base = p.mode.kind === "new" ? p.mode.cost : [];
  const amount = (base[0]?.amount ?? 0) + (sv.verdict === "clear" ? CLEAR_FEE : 0);
  return amount > 0 ? [{ item: "minecraft:emerald", amount }] : [];
}

// ---------- panel ----------

function openPanel(player: Player, p: Placing): void {
  const s = settlementById(p.sid);
  if (!s || !p.current) return;
  p.locked = p.current; // the plot stays put while you decide (and while you walk around it)
  const sv = p.surveyed ?? runSurvey(s, p, p.locked);
  const cost = totalCost(p, sv);
  p.panelOpen = true;

  const form = new CustomForm(player, buildingName(p.defId));
  form.label(statusLine(p, sv, false));
  form.label(raw(txt("§7"), t("bannerforge.place.help")));
  form.spacer();
  const buildLabel = cost.length ? raw(t("bannerforge.place.build"), txt(": "), costText(cost)) : t("bannerforge.place.build");
  form.button(buildLabel, () => close(() => confirm(player, p)), { disabled: sv.verdict === "blocked" || !canAfford(player, cost) });
  form.button(t("bannerforge.place.rotate"), () =>
    close(() => {
      p.locked = turn(p.locked!);
      p.turns = (p.turns + 1) % 4;
    }),
  );
  form.button(t("bannerforge.place.move"), () => close(() => (p.locked = undefined)));
  form.button(t("bannerforge.place.cancel"), () => close(() => stop(player, player.id, "bannerforge.place.cancelled")));

  function close(then: () => void): void {
    form.close();
    system.run(() => {
      p.panelOpen = false;
      then();
    });
  }
  form
    .show()
    .then(() => (p.panelOpen = false))
    .catch(() => (p.panelOpen = false));
}

function confirm(player: Player, p: Placing): void {
  const s = settlementById(p.sid);
  const def = buildingById(p.defId);
  const f = p.locked;
  if (!s || !def || !f) return;

  // Things may have changed since the panel opened: check rules and land again.
  const sv = runSurvey(s, p, f);
  if (sv.verdict === "blocked") {
    player.sendMessage(raw(t(`bannerforge.place.reason.${sv.reason ?? "unloaded"}`)));
    p.surveyedKey = undefined;
    return;
  }
  let index: number;
  let to: BuildingLevel;
  if (p.mode.kind === "new") {
    const c = check(s, { kind: "build", id: def.id });
    if (!c.ok) {
      player.sendMessage(raw(txt("§c"), reasonText(c.reasons[0])));
      stop(player, player.id);
      return;
    }
    to = c.newLevel;
  } else {
    to = (s.buildings[def.id]?.[p.mode.index] ?? 1) as BuildingLevel;
  }
  const cost = totalCost(p, sv);
  if (cost.length && (!canAfford(player, cost) || !pay(player, cost))) {
    player.sendMessage(raw(txt("§c"), t("bannerforge.ledger.cannot_afford"), txt(" "), costText(cost)));
    return;
  }

  const site: Site = { x: f.x, y: sv.groundY, z: f.z, w: f.w, rot: f.rot, built: 0 };
  const sites = ((s.sites ??= {})[def.id] ??= []);
  if (p.mode.kind === "new") {
    const levels = (s.buildings[def.id] ??= []);
    index = levels.length;
    levels.push(0); // counts as built (limits) but gives nothing until construction finishes
  } else {
    index = p.mode.index; // bought before M2a: keeps its level while its building goes up
  }
  sites[index] = site;
  saveSettlement(s);
  startConstruction(s, def.id, index, to);
  refreshActiveSites();
  stop(player, player.id);
  player.sendMessage(raw(txt("§a"), buildingName(def.id), txt(": "), t("bannerforge.place.started")));
  player.playSound("random.levelup", { volume: 0.6 });
}
