// Placing a building (owner decisions, 2026-11-15): the plot follows the player inside the town border,
// its entrance facing the player. Green = can build, orange = village buildings or farms are cleared for a fee,
// red = blocked (with the reason). Using the Building Plan item opens the panel: Build, Rotate, Raise, Lower,
// Move, Cancel. The floor lines up with the ground at the entrance; Raise/Lower adjust it within limits.

import { ItemLockMode, ItemStack, MolangVariableMap, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableUIRawMessage } from "@minecraft/server-ui";
import { pickVariant, topHeightFor, variantsFor } from "./blueprint.js";
import { buildingById, type BuildingDef, type Cost } from "./buildings.js";
import { refreshActiveSites, startConstruction } from "./construction.js";
import { canAfford, pay } from "./economy.js";
import { BORDER_RADIUS, CUT_MAX, FILL_MAX, PLOT_WIDTH, borderPointsNear, footprintInFront, insideBorder, turn, type Footprint, type Rect } from "./plots.js";
import { saveSettlement, settlementById } from "./registry.js";
import { check, tier } from "./rules.js";
import { survey, type Survey } from "./terrain.js";
import { buildingName, costText, raw, reasonText, say, t, txt } from "./text.js";
import type { BuildingLevel, Settlement, Site } from "./types.js";
import { scanAround, vanillaBoxes } from "./vanilla.js";

/** Emeralds the steward asks to clear village buildings or farms on a plot (placeholder price). */
export const CLEAR_FEE = 5;
export const PLAN_ITEM = "bannerforge_settlements:building_plan";
const PARTICLE = "bannerforge_settlements:marker";
const TICK = 2;
/** Placement ends if the player wanders this far from the bell. */
const GIVE_UP_DISTANCE = 200;
const SCAN_RADIUS = 40;

export type PlaceMode =
  | { kind: "new"; cost: Cost[] } // a new building or house: pay on Build
  | { kind: "existing"; index: number }; // bought before M2a, not placed yet: free

interface Placing {
  sid: string;
  defId: string;
  mode: PlaceMode;
  w: number;
  topHeight: number;
  variant?: string;
  turns: number;
  raise: number;
  locked?: Footprint;
  current?: Footprint;
  surveyed?: Survey;
  surveyedKey?: string;
  panelOpen: boolean;
  age: number;
  scanning: boolean;
  lastScan?: { x: number; z: number };
}

const placing = new Map<string, Placing>();
let loop: number | undefined;

export const isPlacing = (player: Player) => placing.has(player.id);

export function startPlacement(player: Player, s: Settlement, def: BuildingDef, mode: PlaceMode): void {
  if (def.plot === "perimeter") return;
  const variant = pickVariant(s.faction, def.id);
  placing.set(player.id, {
    sid: s.id,
    defId: def.id,
    mode,
    w: PLOT_WIDTH[def.plot],
    variant,
    topHeight: topHeightFor(def, s.faction, variant),
    turns: 0,
    raise: 0,
    panelOpen: false,
    age: 0,
    scanning: false,
  });
  givePlan(player);
  player.sendMessage(raw(t("bannerforge.place.start"), txt(" "), buildingName(def.id)));
  player.sendMessage(raw(txt("§7"), t("bannerforge.place.how")));
  loop ??= system.runInterval(tick, TICK);
}

function stop(player: Player | undefined, id: string, messageKey?: string): void {
  placing.delete(id);
  if (player) {
    takePlan(player);
    if (messageKey) say(player, messageKey);
  }
  if (!placing.size && loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
}

// ---------- the Building Plan item ----------

function givePlan(player: Player): void {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === PLAN_ITEM) return;
  const item = new ItemStack(PLAN_ITEM, 1);
  item.lockMode = ItemLockMode.inventory; // can't be dropped or put in chests
  // Into the hand if that slot is free, otherwise anywhere.
  const slot = player.selectedSlotIndex;
  if (!inv.getItem(slot)) inv.setItem(slot, item);
  else inv.addItem(item);
}

function takePlan(player: Player): void {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === PLAN_ITEM) inv.setItem(i, undefined);
}

export function registerPlacement(): void {
  world.afterEvents.itemUse.subscribe((e) => {
    if (e.itemStack.typeId !== PLAN_ITEM) return;
    const p = placing.get(e.source.id);
    if (p && !p.panelOpen) openPanel(e.source, p);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    if (e.itemStack?.typeId !== PLAN_ITEM) return;
    e.cancel = true;
    const player = e.player;
    system.run(() => {
      const p = placing.get(player.id);
      if (p && !p.panelOpen) openPanel(player, p);
    });
  });
  // Plans left over (e.g. after leaving the world mid-placement) are removed.
  system.runInterval(() => {
    for (const player of world.getPlayers()) if (!placing.has(player.id)) takePlan(player);
  }, 100);
}

// ---------- the loop ----------

function tick(): void {
  for (const [id, p] of placing) {
    const player = world.getEntity(id) as Player | undefined;
    if (!player?.isValid) {
      stop(undefined, id);
      continue;
    }
    const s = settlementById(p.sid);
    if (!s || player.dimension.id !== s.dimension) {
      stop(player, id, "bannerforge.place.cancelled");
      continue;
    }
    if (Math.hypot(player.location.x - s.center.x, player.location.z - s.center.z) > GIVE_UP_DISTANCE) {
      stop(player, id, "bannerforge.place.cancelled");
      continue;
    }
    p.age += TICK;
    if (p.age % 6 !== 0) continue;

    scanNearby(player, s, p);
    const f = p.locked ?? footprintAhead(player, p);
    p.current = f;
    const key = `${f.x},${f.z},${f.rot},${p.raise},${vanillaBoxes(s.id).length}`;
    if (key !== p.surveyedKey) {
      p.surveyed = runSurvey(s, p, f);
      p.surveyedKey = key;
    }
    draw(player, s, f, p.surveyed!);
    if (!p.panelOpen && p.age % 12 === 0) player.onScreenDisplay.setActionBar(statusLine(p.surveyed!));
  }
}

/** Looks for vanilla structures around the player in the background (once per area). */
function scanNearby(player: Player, s: Settlement, p: Placing): void {
  if (p.scanning) return;
  const { x, z } = player.location;
  if (p.lastScan && Math.hypot(p.lastScan.x - x, p.lastScan.z - z) < 8) return;
  p.scanning = true;
  p.lastScan = { x, z };
  const job = scanAround(player.dimension, s.id, x, z, SCAN_RADIUS, s.center.y - 32, ownFootprints(s));
  system.runJob(
    (function* () {
      try {
        yield* job;
      } finally {
        p.scanning = false;
      }
    })(),
  );
}

function footprintAhead(player: Player, p: Placing): Footprint {
  const v = player.getViewDirection();
  return footprintInFront(player.location.x, player.location.z, v.x, v.z, p.w, p.turns);
}

function ownFootprints(s: Settlement): Footprint[] {
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
    others: ownFootprints(s),
    vanilla: vanillaBoxes(s.id),
    raise: p.raise,
  });
}

// ---------- drawing ----------

type RGB = { red: number; green: number; blue: number };
const GREEN: RGB = { red: 0.2, green: 1, blue: 0.25 };
const ORANGE: RGB = { red: 1, green: 0.6, blue: 0.05 };
const RED: RGB = { red: 1, green: 0.15, blue: 0.1 };
const WHITE: RGB = { red: 0.85, green: 0.85, blue: 0.9 };
const TAN: RGB = { red: 0.95, green: 0.75, blue: 0.5 };
const GOLD: RGB = { red: 1, green: 0.85, blue: 0.2 };

type Dim = ReturnType<typeof world.getDimension>;

function particle(dim: Dim, x: number, y: number, z: number, color: RGB): void {
  const vars = new MolangVariableMap();
  vars.setColorRGB("variable.color", color);
  try {
    dim.spawnParticle(PARTICLE, { x, y, z }, vars);
  } catch {
    // outside loaded chunks
  }
}

function rectOutline(dim: Dim, r: Rect, y: number, color: RGB, spacing: number): void {
  for (let i = 0; i <= r.wx; i += spacing) {
    particle(dim, r.x + i, y, r.z, color);
    particle(dim, r.x + i, y, r.z + r.wz, color);
  }
  for (let i = 0; i <= r.wz; i += spacing) {
    particle(dim, r.x, y, r.z + i, color);
    particle(dim, r.x + r.wx, y, r.z + i, color);
  }
}

const asRect = (f: Footprint): Rect => ({ x: f.x, z: f.z, wx: f.w, wz: f.w });

function draw(player: Player, s: Settlement, f: Footprint, sv: Survey): void {
  const dim = player.dimension;
  const y = (sv.groundY || Math.floor(player.location.y) - 1) + 1.1;
  const color = sv.verdict === "ok" ? GREEN : sv.verdict === "clear" ? ORANGE : RED;
  rectOutline(dim, asRect(f), y, color, 1);
  // Entrance arrow: three dots leading out of the front edge.
  const STEP: Record<number, [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };
  const [sx, sz] = STEP[f.rot];
  for (let k = 0; k < 3; k++) {
    const r = f.w / 2 + 0.5 + k;
    particle(dim, f.x + f.w / 2 + sx * r, y + 0.2, f.z + f.w / 2 + sz * r, color);
  }
  const near = (r: Rect) => Math.hypot(r.x - player.location.x, r.z - player.location.z) < 48;
  for (const o of ownFootprints(s)) if (near(asRect(o))) rectOutline(dim, asRect(o), y, WHITE, 2);
  for (const v of vanillaBoxes(s.id)) if (near(v)) rectOutline(dim, v, y, TAN, 2);
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

/** Short status for the action bar (owner: the info text was too long). */
function statusLine(sv: Survey): RawMessage {
  if (sv.verdict === "ok") return t("bannerforge.place.ok");
  if (sv.verdict === "clear") return t("bannerforge.place.clear", String(CLEAR_FEE));
  return t(`bannerforge.place.reason.${sv.reason ?? "unloaded"}`);
}

function totalCost(p: Placing, sv: Survey): Cost[] {
  const base = p.mode.kind === "new" ? p.mode.cost : [];
  const amount = (base[0]?.amount ?? 0) + (sv.verdict === "clear" ? CLEAR_FEE : 0);
  return amount > 0 ? [{ item: "minecraft:emerald", amount }] : [];
}

function floorLine(p: Placing): RawMessage {
  const sign = p.raise > 0 ? "+" : "";
  return p.raise === 0 ? t("bannerforge.place.floor_entrance") : raw(t("bannerforge.place.floor_raised"), txt(` ${sign}${p.raise}`));
}

// ---------- panel ----------

/** The panel stays open while you rotate or raise/lower; the outline behind it updates. */
function openPanel(player: Player, p: Placing): void {
  const s = settlementById(p.sid);
  if (!s || !p.current) return;
  p.locked = p.current; // the plot stays put while you decide (and while you walk around it)
  p.panelOpen = true;

  const status = new ObservableUIRawMessage(txt(""));
  const floor = new ObservableUIRawMessage(txt(""));
  const buildLabel = new ObservableUIRawMessage(txt(""));
  const buildDisabled = new ObservableBoolean(true);
  const raiseDisabled = new ObservableBoolean(false);
  const lowerDisabled = new ObservableBoolean(false);

  const update = () => {
    const sv = runSurvey(s, p, p.locked!);
    p.surveyed = sv;
    p.surveyedKey = undefined;
    const cost = totalCost(p, sv);
    status.setData(statusLine(sv));
    floor.setData(p.variant ? raw(txt("§7"), t("bannerforge.place.design"), txt(` ${p.variant.toUpperCase()}  ·  `), floorLine(p)) : raw(txt("§7"), floorLine(p)));
    buildLabel.setData(cost.length ? raw(t("bannerforge.place.build"), txt(": "), costText(cost)) : t("bannerforge.place.build"));
    buildDisabled.setData(sv.verdict === "blocked" || !canAfford(player, cost));
    raiseDisabled.setData(p.raise >= FILL_MAX);
    lowerDisabled.setData(p.raise <= -CUT_MAX);
  };

  const form = new CustomForm(player, buildingName(p.defId));
  form.label(status);
  form.label(floor);
  form.spacer();
  form.button(buildLabel, () => close(() => confirm(player, p)), { disabled: buildDisabled });
  form.button(t("bannerforge.place.rotate"), () => {
    p.locked = turn(p.locked!);
    p.turns = (p.turns + 1) % 4;
    update();
  });
  form.button(
    t("bannerforge.place.raise"),
    () => {
      p.raise++;
      update();
    },
    { disabled: raiseDisabled },
  );
  form.button(
    t("bannerforge.place.lower"),
    () => {
      p.raise--;
      update();
    },
    { disabled: lowerDisabled },
  );
  // Several designs of this building: let the player pick (owner: fewer copy-paste houses).
  const variants = variantsFor(s.faction, p.defId);
  if (variants.length > 1) {
    form.button(t("bannerforge.place.variant"), () => {
      p.variant = variants[(variants.indexOf(p.variant ?? "") + 1) % variants.length];
      const def = buildingById(p.defId);
      if (def) p.topHeight = topHeightFor(def, s.faction, p.variant);
      update();
    });
  }
  form.button(t("bannerforge.place.move"), () => close(() => (p.locked = undefined)));
  form.button(t("bannerforge.place.cancel"), () => close(() => stop(player, player.id, "bannerforge.place.cancelled")));
  update();

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

  const site: Site = { x: f.x, y: sv.groundY, z: f.z, w: f.w, rot: f.rot, built: 0, ...(p.variant ? { variant: p.variant } : {}) };
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
