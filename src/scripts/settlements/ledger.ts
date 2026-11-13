// The steward's ledger: three short screens (approved mockup "BannerForge Steward UI v2", 2026-11-13).
//   Overview  -> Section -> Building
// Each screen is a DDUI CustomForm (stable in @minecraft/server-ui 2.3.0). The Building screen updates in place
// after a purchase, and the result is shown right above its button, with a sound.

import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableUIRawMessage } from "@minecraft/server-ui";
import { BUILDINGS, CATEGORIES, PROMOTION, type BuildingDef, type Category } from "./buildings.js";
import { canAfford, countItem, pay } from "./economy.js";
import { saveSettlement } from "./registry.js";
import { apply, check, highest, housing, instances, npcDemand, population, prosperity, tier, type Action, type Check } from "./rules.js";
import { FACTION_COLOUR, buildingName, costText, levelName, raw, reasonText, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

/** Replaced with the resource pack's UUID at build time (tools/build.mjs). */
const RP_PACK_ID = "__RP_PACK_ID__";
const UI = "textures/bannerforge/ui/";
const icon = (name: string) => ({ imagePackId: RP_PACK_ID, imageSrc: UI + name });

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

function show(form: CustomForm): void {
  form.show().catch((e) => console.warn(`[BannerForge] ledger: ${e}`));
}

// ---------- shared state helpers ----------

/** The actions a building's screen offers. Houses: build a new one, and upgrade the lowest one. */
function actionsFor(s: Settlement, def: BuildingDef): Action[] {
  const list = instances(s, def.id);
  if (!def.perTier) return [list.length ? { kind: "upgrade", id: def.id, index: 0 } : { kind: "build", id: def.id }];
  const actions: Action[] = [{ kind: "build", id: def.id }];
  if (list.length) {
    let lowest = 0;
    list.forEach((level, i) => {
      if (level < list[lowest]) lowest = i;
    });
    actions.push({ kind: "upgrade", id: def.id, index: lowest });
  }
  return actions;
}

const onlyTierLimits = (c: Check) => !c.ok && c.reasons.every((r) => r.key === "tier_cap" || r.key === "max_level" || r.key === "limit");

type RowState = "can" | "done" | "locked";

/** Short status for a section row: ▲ can do now, ✔ done for this tier, Locked = needs something first. */
function rowState(s: Settlement, def: BuildingDef): RowState {
  const checks = actionsFor(s, def).map((a) => check(s, a));
  if (checks.some((c) => c.ok)) return "can";
  if (checks.every(onlyTierLimits)) return "done";
  return "locked";
}

/** Row label, one line (buttons show one line): "Tavern · Basic ▲", "Stables · Locked", "Woodcarver · Build ▲". */
function rowLabel(s: Settlement, def: BuildingDef): RawMessage {
  const state = rowState(s, def);
  const list = instances(s, def.id);
  const level = highest(s, def.id);
  const name = buildingName(def.id);
  const sep = txt(" · ");
  if (def.perTier) {
    const count = txt(` ×${list.length}`);
    return raw(name, count, sep, state === "can" ? raw(t("bannerforge.ledger.row_can"), txt(" ▲")) : state === "done" ? txt("✔") : t("bannerforge.ledger.locked"));
  }
  if (level === 0) return raw(name, sep, state === "can" ? raw(t("bannerforge.ledger.build"), txt(" ▲")) : t("bannerforge.ledger.locked"));
  const mark = state === "can" ? txt(" ▲") : state === "done" ? txt(" ✔") : raw(txt(" · "), t("bannerforge.ledger.locked"));
  return raw(name, sep, levelName(level), mark);
}

// ---------- 1. Overview ----------

export function showOverview(player: Player, s: Settlement): void {
  const tr = tier(s);
  const form = new CustomForm(player, t("bannerforge.ledger.title"));

  // Faction above the town name, in one element; the banner image sits right above it.
  form.image(UI + `banner_${s.faction}`, RP_PACK_ID, { width: 0.18 });
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
    const can = defs.filter((d) => rowState(s, d) === "can").length;
    const built = defs.filter((d) => highest(s, d.id) > 0).length;
    const summary = can > 0 ? raw(t("bannerforge.ledger.can_upgrade", String(can)), txt(" ▲")) : t("bannerforge.ledger.built_count", String(built), String(defs.length));
    form.button(raw(t(`bannerforge.category.${category}`), txt(" · "), summary), () => go(form, () => showSection(player, s, category)), {
      imageDetails: icon(SECTION_ICON[category]),
    });
  }
  form.closeButton();
  show(form);
}

// ---------- 2. Section ----------

export function showSection(player: Player, s: Settlement, category: Category): void {
  const form = new CustomForm(player, t(`bannerforge.category.${category}`));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showOverview(player, s)));
  form.label(raw(txt("§7"), t("bannerforge.ledger.legend")));
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
  form.closeButton();
  show(form);
}

// ---------- 3. Building ----------

/** "Basic: Innkeeper: rest, rumours, food" */
const levelLine = (def: BuildingDef, level: number) =>
  level === 0 ? t("bannerforge.ledger.not_built") : raw(levelName(level), txt(": "), t(`bannerforge.desc.${def.id}.${level}`));

export function showBuilding(player: Player, s: Settlement, def: BuildingDef): void {
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
  form.image(UI + def.id, RP_PACK_ID, { width: 0.3 });
  form.label(now);
  form.label(next);
  form.label(needs);
  form.label(feedback, { visible: feedbackVisible });
  buttons.forEach((b, slot) => form.button(b.label, () => onBuy(slot), { disabled: b.disabled, visible: b.visible }));
  form.button(t("bannerforge.ledger.go_population"), () => go(form, () => showSection(player, s, "population")), { visible: goPopulation });
  form.closeButton();

  function refresh(): void {
    const list = instances(s, def.id);
    const level = highest(s, def.id);
    const actions = actionsFor(s, def);
    const checks = actions.map((a) => check(s, a));

    // Now / next
    if (def.perTier) {
      now.setData(raw(txt("§7"), t("bannerforge.ledger.now"), txt("§r "), t("bannerforge.ledger.house_count", String(list.length), String(def.perTier[tier(s)])), txt(` · `), t("bannerforge.steward.population_limit"), txt(` ${housing(s)}`)));
      next.setData(raw(txt("§7"), t("bannerforge.ledger.each_level"), txt("§r "), levelLine(def, 1), txt("\n"), levelLine(def, 2), txt("\n"), levelLine(def, 3)));
    } else {
      now.setData(raw(txt("§7"), t("bannerforge.ledger.now"), txt("§r "), levelLine(def, level)));
      next.setData(level < 3 ? raw(txt("§7"), t("bannerforge.ledger.next"), txt("§r "), levelLine(def, level + 1)) : txt(""));
    }

    // What's needed: for the main action, every reason (red) or ready (green); then cost vs wallet.
    const main = checks.find((c) => c.ok) ?? checks[0];
    const wallet = countItem(player, "minecraft:emerald");
    const parts: RawMessage[] = [];
    if (main.ok) {
      parts.push(txt("§a✔§r "), t("bannerforge.ledger.ready"), txt("\n"));
      parts.push(txt("§7"), t("bannerforge.ledger.cost"), txt("§r "), costText(main.cost), txt(" · "), t("bannerforge.ledger.you_have", String(wallet)));
    } else {
      for (const r of main.reasons) parts.push(txt("§c✘§r "), reasonText(r), txt("\n"));
      parts.push(txt("§7"), t("bannerforge.ledger.you_have", String(wallet)));
    }
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
      if (c.ok) {
        b.label.setData(raw(t(verb), txt(" → "), levelName(c.newLevel), txt(" · "), costText(c.cost)));
        b.disabled.setData(false);
      } else if (current >= 3) {
        b.label.setData(raw(levelName(3), txt(" ✔")));
        b.disabled.setData(true);
      } else {
        b.label.setData(raw(t(verb), txt(" · "), t("bannerforge.ledger.locked")));
        b.disabled.setData(true);
      }
    });
  }

  function onBuy(slot: number): void {
    const action = actionsFor(s, def)[slot];
    if (!action) return;
    const c = check(s, action);
    let message: RawMessage;
    if (!c.ok) {
      message = raw(txt("§c"), reasonText(c.reasons[0]));
      player.playSound("note.bass");
    } else if (!canAfford(player, c.cost) || !pay(player, c.cost)) {
      message = raw(txt("§c"), t("bannerforge.ledger.cannot_afford"), txt(" "), costText(c.cost));
      player.playSound("note.bass");
    } else {
      const oldTier = tier(s);
      apply(s, action, c.newLevel);
      saveSettlement(s);
      // Structures are not placed yet (roadmap M2): the purchase is recorded and reported here.
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
