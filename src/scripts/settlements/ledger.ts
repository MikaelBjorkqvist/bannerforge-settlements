// The steward's ledger: three short screens (approved mockup "BannerForge Steward UI v2", 2026-11-13).
//   Overview  -> Section -> Building
// Each screen is a DDUI CustomForm (stable in @minecraft/server-ui 2.3.0). The Building screen updates in place
// after a purchase, and the result is shown right above its button, with a sound.

import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableUIRawMessage } from "@minecraft/server-ui";
import { BUILDINGS, CATEGORIES, PROMOTION, type BuildingDef, type Category } from "./buildings.js";
import { canAfford, countItem, pay } from "./economy.js";
import { constructionMinutesLeft, startConstruction } from "./construction.js";
import { showBorder, startPlacement } from "./placement.js";
import { saveSettlement, settlementById } from "./registry.js";
import { apply, check, highest, housing, instances, npcDemand, population, prosperity, tier, type Action, type Check } from "./rules.js";
import { uiIcon } from "./ui_images.js";
import { FACTION_COLOUR, buildingName, costText, levelName, raw, reasonText, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

const icon = uiIcon;

const SECTION_ICON: Record<Category, string> = {
  centre: "section_centre",
  population: "section_population",
  trade: "section_trade",
  food: "section_food",
  defence: "section_defence",
};

/** Closes the current screen and opens the next one on the following tick. */
function go(form: CustomForm, next: () => void): void {
  form.close();
  system.run(next);
}

/** Construction moves on while menus are closed: always work on the saved settlement. */
const latest = (s: Settlement): Settlement => settlementById(s.id) ?? s;

const siteOf = (s: Settlement, id: string, index: number) => s.sites?.[id]?.[index] ?? null;
const building = (s: Settlement, id: string, index: number) => !!siteOf(s, id, index)?.build;

/** Like rules.check, but an instance being built can't be bought again until it is finished. */
function checkFor(s: Settlement, a: Action): Check {
  if (a.kind === "upgrade" && building(s, a.id, a.index)) {
    const minutes = constructionMinutesLeft(siteOf(s, a.id, a.index)) ?? 0;
    return { ok: false, reasons: [{ key: "under_construction", args: [String(minutes)] }] };
  }
  return check(s, a);
}

function show(form: CustomForm): void {
  form.show().catch((e) => console.warn(`[BannerForge] ledger: ${e}`));
}

// ---------- shared state helpers ----------

/** The actions a building's screen offers. Houses: build a new one, and upgrade the lowest one. */
function actionsFor(s: Settlement, def: BuildingDef): Action[] {
  const list = instances(s, def.id);
  if (!def.perTier) return [list.length ? { kind: "upgrade", id: def.id, index: 0 } : { kind: "build", id: def.id }];
  const actions: Action[] = [{ kind: "build", id: def.id }];
  // Upgrade the lowest house that isn't being built right now.
  let lowest = -1;
  list.forEach((level, i) => {
    if (building(s, def.id, i)) return;
    if (lowest < 0 || level < list[lowest]) lowest = i;
  });
  if (lowest >= 0) actions.push({ kind: "upgrade", id: def.id, index: lowest });
  return actions;
}

const onlyTierLimits = (c: Check) => !c.ok && c.reasons.every((r) => r.key === "tier_cap" || r.key === "max_level" || r.key === "limit");

type RowState = "can" | "done" | "locked" | "busy";

/** Short status for a section row: ▲ can do now, ✔ done for this tier, Locked = needs something first. */
function rowState(s: Settlement, def: BuildingDef): RowState {
  const checks = actionsFor(s, def).map((a) => checkFor(s, a));
  if (checks.some((c) => c.ok)) return "can";
  if ((s.sites?.[def.id] ?? []).some((site) => site?.build)) return "busy";
  if (checks.every(onlyTierLimits)) return "done";
  return "locked";
}

const ROMAN = ["", "I", "II", "III"];
const SYMBOL: Record<RowState, string> = { can: "▲", done: "✔", locked: "✘", busy: "⚒" };

/**
 * Row label, kept short because buttons show one line (owner: "less is more"):
 *   "Tavern I  ▲"  can upgrade · "Woodcarver  +"  can build · "Blacksmith I  ✔"  done for this tier · "Stables  ✘"  locked
 */
function rowLabel(s: Settlement, def: BuildingDef): RawMessage {
  const state = rowState(s, def);
  const level = highest(s, def.id);
  const name = buildingName(def.id);
  if (def.perTier) return raw(name, txt(` ×${instances(s, def.id).length}  ${SYMBOL[state]}`));
  if (level === 0) return raw(name, txt(state === "can" ? "  +" : `  ${SYMBOL[state]}`));
  return raw(name, txt(` ${ROMAN[level]}  ${SYMBOL[state]}`));
}

// ---------- 1. Overview ----------

export function showOverview(player: Player, s: Settlement): void {
  s = latest(s);
  const tr = tier(s);
  const form = new CustomForm(player, t("bannerforge.ledger.title"));

  // Faction above the town name, in one element. (No image rows: owner prefers icons on buttons only.)
  form.header(raw(txt(FACTION_COLOUR[s.faction] ?? ""), t(`bannerforge.faction.${s.faction}`), txt(`\n§f${s.name}`)));

  const waiting = npcDemand(s) - housing(s);
  if (waiting > 0) form.label(raw(txt("§6⚠ "), t("bannerforge.steward.jobs_waiting", String(waiting))));

  const nextTier = tr === "village" ? "town" : tr === "town" ? "city" : undefined;
  if (nextTier) {
    const promo = PROMOTION[nextTier];
    const line = (ok: boolean, ...body: RawMessage[]) => raw(txt(ok ? "§a✔§r " : "§c✘§r "), ...body, txt("\n"));
    form.divider();
    form.header(raw(t("bannerforge.steward.next"), txt(" "), t(`bannerforge.tier.${nextTier}`)));
    const parts: RawMessage[] = [
      line(prosperity(s) >= promo.prosperity, t("bannerforge.steward.prosperity"), txt(` ${prosperity(s)} / ${promo.prosperity}`)),
      line(population(s) >= promo.population, t("bannerforge.steward.population"), txt(` ${population(s)} / ${promo.population}`)),
      ...promo.requires.map((r) => line(highest(s, r.id) >= r.level, buildingName(r.id), txt(": "), levelName(r.level))),
      raw(txt("§7"), t("bannerforge.steward.then_town_hall")),
    ];
    form.label(raw(...parts));
  } else {
    form.divider();
    form.label(raw(txt("§a"), t("bannerforge.steward.top_tier")));
  }

  form.divider();
  for (const category of CATEGORIES) {
    const defs = BUILDINGS.filter((b) => b.category === category);
    const anyCan = defs.some((d) => rowState(s, d) === "can");
    form.button(raw(t(`bannerforge.category.${category}`), txt(anyCan ? "  ▲" : "")), () => go(form, () => showSection(player, s, category)), {
      imageDetails: icon(SECTION_ICON[category]),
    });
  }
  form.divider();
  form.button(t("bannerforge.ledger.show_border"), () => go(form, () => showBorder(player, s)));
  show(form);
}

// ---------- 2. Section ----------

export function showSection(player: Player, s: Settlement, category: Category): void {
  s = latest(s);
  const form = new CustomForm(player, t(`bannerforge.category.${category}`));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showOverview(player, s)));
  form.label(raw(txt("§7"), t("bannerforge.ledger.legend_1"), txt("\n"), t("bannerforge.ledger.legend_2")));
  form.divider();

  const defs = BUILDINGS.filter((b) => b.category === category);
  const addRow = (def: BuildingDef) =>
    form.button(rowLabel(s, def), () => go(form, () => showBuilding(player, s, def)), { imageDetails: icon(def.id) });
  defs.filter((d) => !d.group).forEach(addRow);
  const groups = [...new Set(defs.map((d) => d.group).filter((g): g is "craftsmen" => !!g))];
  for (const g of groups) {
    form.header(t(`bannerforge.group.${g}`));
    defs.filter((d) => d.group === g).forEach(addRow);
  }
  show(form);
}

// ---------- 3. Building ----------

export function showBuilding(player: Player, s: Settlement, def: BuildingDef): void {
  s = latest(s);
  const form = new CustomForm(player, buildingName(def.id));
  const now = new ObservableUIRawMessage(txt(""));
  const next = new ObservableUIRawMessage(txt(""));
  const needs = new ObservableUIRawMessage(txt(""));
  const feedback = new ObservableUIRawMessage(txt(""));
  const feedbackVisible = new ObservableBoolean(false);
  const goPopulation = new ObservableBoolean(false);
  const slots = def.perTier ? 2 : 1;
  const buttons = Array.from({ length: slots }, () => ({ label: new ObservableUIRawMessage(txt("")), disabled: new ObservableBoolean(true), visible: new ObservableBoolean(true) }));

  form.button(t("bannerforge.ledger.back"), () => go(form, () => showSection(player, s, def.category)));
  form.label(now);
  form.spacer();
  form.label(next);
  form.spacer();
  form.label(needs);
  form.label(feedback, { visible: feedbackVisible });
  form.spacer();
  buttons.forEach((b, slot) => form.button(b.label, () => onBuy(slot), { disabled: b.disabled, visible: b.visible, imageDetails: icon(def.id) }));
  form.button(t("bannerforge.ledger.go_population"), () => go(form, () => showSection(player, s, "population")), { visible: goPopulation });

  function refresh(): void {
    const list = instances(s, def.id);
    const level = highest(s, def.id);
    const actions = actionsFor(s, def);
    const checks = actions.map((a) => checkFor(s, a));

    // Now / next. Readable layout (owner, play-test 4): the white line names the level, the grey line under it
    // says what it gives. Descriptions are kept short (lang) so they rarely wrap.
    const levelBlock = (labelKey: string, lvl: number): RawMessage =>
      lvl === 0
        ? raw(t(labelKey), txt(" "), t("bannerforge.ledger.not_built"))
        : raw(t(labelKey), txt(" "), levelName(lvl), txt("\n§7"), t(`bannerforge.desc.${def.id}.${lvl}`));
    let nowMsg: RawMessage;
    if (def.perTier) {
      const limit = def.perTier[tier(s)];
      const h = def.housing ?? [0, 0, 0];
      nowMsg = (raw(t("bannerforge.ledger.houses"), txt(` ${list.length} / ${limit}\n§7`), t("bannerforge.steward.population_limit"), txt(` ${housing(s)}`)));
      next.setData(raw(t("bannerforge.ledger.each_house"), txt(`\n§7+${h[0]} / +${h[1]} / +${h[2]} `), t("bannerforge.ledger.limit_by_level")));
    } else {
      nowMsg = levelBlock("bannerforge.ledger.now", level);
      next.setData(level < 3 ? levelBlock("bannerforge.ledger.next", level + 1) : txt(""));
    }
    const underway = (s.sites?.[def.id] ?? []).map(constructionMinutesLeft).filter((m): m is number => m !== undefined);
    if (underway.length) nowMsg = raw(nowMsg, txt("\n§e⚒ "), t("bannerforge.ledger.construction_line", String(Math.min(...underway))));
    now.setData(nowMsg);

    // What's needed: reasons in red (or ready in green), then cost and wallet, all white lines.
    const main = checks.find((c) => c.ok) ?? checks[0];
    const wallet = countItem(player, "minecraft:emerald");
    const parts: RawMessage[] = [];
    if (main.ok) {
      const price = main.cost[0]?.amount ?? 0;
      if (wallet >= price) parts.push(txt("§a✔ "), t("bannerforge.ledger.ready"), txt("§r\n"));
      else parts.push(txt("§c✘ "), t("bannerforge.ledger.short_by", String(price - wallet)), txt("§r\n"));
      parts.push(t("bannerforge.ledger.cost"), txt(" "), costText(main.cost), txt("\n"));
    } else {
      for (const r of main.reasons) parts.push(txt("§c✘ "), reasonText(r), txt("§r\n"));
    }
    parts.push(t("bannerforge.ledger.you_have"), txt(` ${wallet}`));
    needs.setData(raw(...parts));
    goPopulation.setData(checks.every((c) => !c.ok && c.reasons.some((r) => r.key === "needs_population")));

    // Buttons
    buttons.forEach((b, slot) => {
      const action = actions[slot];
      const c = checks[slot];
      if (!action || !c) {
        b.visible.setData(false);
        return;
      }
      b.visible.setData(true);
      const verb = action.kind === "build" ? (def.perTier ? "bannerforge.ledger.build_new" : "bannerforge.ledger.build") : def.perTier ? "bannerforge.ledger.upgrade_lowest" : "bannerforge.ledger.upgrade";
      const current = action.kind === "upgrade" ? list[action.index] ?? 0 : 0;
      const placed = def.plot !== "perimeter";
      if (action.kind === "upgrade" && building(s, def.id, action.index)) {
        b.label.setData(raw(t("bannerforge.ledger.under_construction"), txt(" ⚒")));
        b.disabled.setData(true);
      } else if (action.kind === "upgrade" && placed && current > 0 && !siteOf(s, def.id, action.index)) {
        // Bought before buildings were placed (M2a): put it on a plot for free first.
        b.label.setData(t("bannerforge.ledger.place_free"));
        b.disabled.setData(false);
      } else if (c.ok) {
        // "Upgrade: 16 Emeralds" (the Next line above says what it becomes); greyed out until affordable.
        b.label.setData(raw(t(verb), txt(": "), costText(c.cost)));
        b.disabled.setData(!canAfford(player, c.cost));
      } else if (current >= 3) {
        b.label.setData(raw(t("bannerforge.ledger.complete"), txt(" ✔")));
        b.disabled.setData(true);
      } else {
        b.label.setData(raw(t("bannerforge.ledger.locked"), txt(" ✘")));
        b.disabled.setData(true);
      }
    });
  }

  function onBuy(slot: number): void {
    s = latest(s);
    const action = actionsFor(s, def)[slot];
    if (!action) return;
    const placed = def.plot !== "perimeter";
    if (action.kind === "upgrade" && building(s, def.id, action.index)) return;
    if (action.kind === "upgrade" && placed && (s.buildings[def.id]?.[action.index] ?? 0) > 0 && !siteOf(s, def.id, action.index)) {
      go(form, () => startPlacement(player, s, def, { kind: "existing", index: action.index }));
      return;
    }
    const c = checkFor(s, action);
    // A new building is placed first and paid for when you press Build on the plot.
    if (c.ok && placed && action.kind === "build") {
      if (!canAfford(player, c.cost)) {
        feedback.setData(raw(txt("§c"), t("bannerforge.ledger.cannot_afford"), txt(" "), costText(c.cost)));
        feedbackVisible.setData(true);
        player.playSound("note.bass");
        return;
      }
      go(form, () => startPlacement(player, s, def, { kind: "new", cost: c.cost }));
      return;
    }
    let message: RawMessage;
    if (!c.ok) {
      message = raw(txt("§c"), reasonText(c.reasons[0]));
      player.playSound("note.bass");
    } else if (!canAfford(player, c.cost) || !pay(player, c.cost)) {
      message = raw(txt("§c"), t("bannerforge.ledger.cannot_afford"), txt(" "), costText(c.cost));
      player.playSound("note.bass");
    } else if (placed && action.kind === "upgrade") {
      // Upgrades rebuild the building on its plot over one day; the level counts when it is finished.
      startConstruction(s, def.id, action.index, c.newLevel);
      message = raw(txt("§a⚒ "), buildingName(def.id), txt(" "), levelName(c.newLevel), txt(": "), t("bannerforge.ledger.build_started"));
      player.playSound("random.levelup", { volume: 0.6 });
    } else {
      // Perimeter buildings (Defences) have no plot yet (roadmap M3): the purchase counts right away.
      const oldTier = tier(s);
      apply(s, action, c.newLevel);
      saveSettlement(s);
      const verb = action.kind === "build" ? "bannerforge.ledger.built" : "bannerforge.ledger.upgraded";
      const parts: RawMessage[] = [txt("§a✔ "), buildingName(def.id), txt(" "), t(verb), txt(" "), levelName(c.newLevel), txt("!")];
      if (tier(s) !== oldTier) {
        const promoted = raw(t("bannerforge.tier.promoted", s.name), txt(" "), t(`bannerforge.tier.${tier(s)}`), txt("!"));
        parts.push(txt("\n§6"), promoted);
        world.sendMessage(promoted); // everyone else hears about it in chat
      }
      message = raw(...parts);
      player.playSound("random.levelup", { volume: 0.6 });
    }
    feedback.setData(message);
    feedbackVisible.setData(true);
    refresh();
  }

  refresh();
  show(form);
}
