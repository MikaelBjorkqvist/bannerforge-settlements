import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ModalFormData, ObservableBoolean, ObservableUIRawMessage } from "@minecraft/server-ui";
import { BUILDINGS, CATEGORIES, FOUNDING_COST, PROMOTION, type BuildingDef, type Cost } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { newSettlementId, saveSettlement, settlementNear } from "./registry.js";
import { apply, check, highest, housing, instances, npcDemand, population, prosperity, tier, type Action, type Reason } from "./rules.js";
import { FACTIONS, SCHEMA, type Settlement } from "./types.js";

const BELL_ID = "minecraft:bell";
/** Ignore repeat interactions from the same player within this many ticks (holding "use" fires repeatedly). */
const BELL_COOLDOWN_TICKS = 20;
/** A bell within this horizontal distance of an existing settlement belongs to it. */
const SETTLEMENT_RADIUS = 48;

// ---------- text helpers ----------

const t = (key: string, ...args: string[]): RawMessage =>
  args.length ? { translate: key, with: args } : { translate: key };

const raw = (...parts: RawMessage[]): RawMessage => ({ rawtext: parts });

function say(player: Player, key: string, ...args: string[]): void {
  player.sendMessage(raw(t(key, ...args)));
}

/** "Amberwood Order (Green)" — used where the player picks a faction. */
function factionWithColour(f: string): RawMessage {
  return raw(t(`bannerforge.faction.${f}`), { text: " (" }, t(`bannerforge.colour.${f}`), { text: ")" });
}

/** "12 Emeralds" style text for a cost list. */
function costText(costs: Cost[]): RawMessage {
  const parts: RawMessage[] = [];
  costs.forEach((c, i) => {
    if (i > 0) parts.push({ text: ", " });
    parts.push({ text: `${c.amount} ` }, t(`bannerforge.currency.${c.item.replace(":", ".")}`));
  });
  return raw(...parts);
}

function reasonsText(reasons: Reason[]): RawMessage {
  const parts: RawMessage[] = [];
  reasons.forEach((r, i) => {
    if (i > 0) parts.push({ text: ", " });
    const key = `bannerforge.rule.${r.key}`;
    parts.push(
      r.args.length
        ? { translate: key, with: raw(...r.args.map((a, j) => (r.translateArgs?.includes(j) ? { translate: a } : { text: a }))) }
        : { translate: key },
    );
  });
  return raw(...parts);
}

const buildingName = (id: string) => t(`bannerforge.building.${id}`);
const levelName = (level: number) => t(`bannerforge.level.${level}`);

// ---------- bell: founding or steward ----------

/**
 * Option B (owner decision, 2026-11-12): ringing a village bell calls the steward.
 * - Unclaimed bell: the (neutral) steward answers and offers to found a settlement for a fee.
 * - Bell of an existing settlement: the steward answers with the settlement ledger.
 * Until the steward NPC exists (roadmap M1), the steward's screens open straight from the bell.
 */
export function registerBellSteward(): void {
  const lastRing = new Map<string, number>();
  world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.block.typeId !== BELL_ID) return;
    const player = event.player;
    const now = system.currentTick;
    if (now - (lastRing.get(player.id) ?? -BELL_COOLDOWN_TICKS) < BELL_COOLDOWN_TICKS) return;
    lastRing.set(player.id, now);

    const { x, y, z } = event.block.location;
    const dimensionId = event.block.dimension.id;
    const existing = settlementNear(dimensionId, { x, y, z }, SETTLEMENT_RADIUS);
    if (existing) {
      showLedger(player, existing);
    } else {
      say(player, "bannerforge.bell.steward_arrives");
      void showClaimForm(player, dimensionId, { x, y, z });
    }
  });
}

async function showClaimForm(player: Player, dimensionId: string, bell: { x: number; y: number; z: number }): Promise<void> {
  if (!canAfford(player, FOUNDING_COST)) {
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), { text: " " }, costText(FOUNDING_COST)));
    return;
  }
  const form = new ModalFormData()
    .title(t("bannerforge.claim.title"))
    .textField(raw(t("bannerforge.claim.name_label"), { text: "\n§7" }, t("bannerforge.claim.cost"), { text: " " }, costText(FOUNDING_COST)), t("bannerforge.claim.name_placeholder"))
    .dropdown(t("bannerforge.claim.faction_label"), FACTIONS.map(factionWithColour))
    .submitButton(t("bannerforge.claim.submit"));

  const response = await form.show(player);
  if (response.canceled || !response.formValues) return;

  const [rawName, factionIndex] = response.formValues;
  const name = String(rawName ?? "").trim().slice(0, 32);
  if (!name) {
    say(player, "bannerforge.claim.name_required");
    return;
  }
  // Pay on submit: the player may have dropped emeralds while the form was open.
  if (!pay(player, FOUNDING_COST)) {
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), { text: " " }, costText(FOUNDING_COST)));
    return;
  }

  const settlement: Settlement = {
    schema: SCHEMA,
    id: newSettlementId(),
    name,
    faction: FACTIONS[Number(factionIndex) || 0],
    dimension: dimensionId,
    center: bell,
    foundedBy: player.id,
    foundedAt: system.currentTick,
    buildings: {},
  };
  saveSettlement(settlement);
  world.sendMessage(raw(t("bannerforge.claim.announce", player.name, name)));
  showLedger(player, settlement);
}

// ---------- the steward's ledger: one live screen ----------

/** Status block: faction, tier, prosperity, population vs limit, and the checklist for the next tier. */
function statusText(s: Settlement): RawMessage {
  const tr = tier(s);
  const parts: RawMessage[] = [
    t(`bannerforge.faction.${s.faction}`), { text: " · " }, t(`bannerforge.tier.${tr}`), { text: "\n" },
    t("bannerforge.steward.prosperity"), { text: `: ${prosperity(s)}   ` },
    t("bannerforge.steward.population"), { text: `: ${population(s)}   ` },
    t("bannerforge.steward.population_limit"), { text: `: ${housing(s)}` },
  ];
  const waiting = npcDemand(s) - population(s);
  if (waiting > 0) parts.push({ text: "\n§6" }, t("bannerforge.steward.jobs_waiting", String(waiting)), { text: "§r" });

  const nextTier = tr === "village" ? "town" : tr === "town" ? "city" : undefined;
  if (nextTier) {
    const promo = PROMOTION[nextTier];
    const mark = (ok: boolean): RawMessage => ({ text: ok ? "§a✔ " : "§c✘ " });
    parts.push({ text: "\n\n§r" }, t("bannerforge.steward.next_tier"), { text: " " }, t(`bannerforge.tier.${nextTier}`), { text: "\n" });
    parts.push(mark(prosperity(s) >= promo.prosperity), { text: "§r" }, t("bannerforge.steward.prosperity"), { text: ` ${prosperity(s)}/${promo.prosperity}   ` });
    parts.push(mark(population(s) >= promo.population), { text: "§r" }, t("bannerforge.steward.population"), { text: ` ${population(s)}/${promo.population}` });
    for (const r of promo.requires) {
      parts.push({ text: "   " }, mark(highest(s, r.id) >= r.level), { text: "§r" }, buildingName(r.id), { text: " " }, levelName(r.level));
    }
    parts.push({ text: "\n§7" }, t("bannerforge.steward.promote_hint"), { text: " " }, buildingName("town_hall"), { text: " → " }, levelName(promo.townHallLevel), { text: "§r" });
  }
  return raw(...parts);
}

/** The action a building's row performs right now. Houses: build a new one, or upgrade the lowest one. */
function rowActions(s: Settlement, def: BuildingDef): Action[] {
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

/**
 * One row's button text, written as the action it takes:
 *   "Build Tavern (Basic) - 8 Emeralds" / "Upgrade Tavern: Basic → Improved - 16 Emeralds" / "Tavern: Advanced ✔"
 * plus a second line with the reason when it's locked.
 */
function rowText(s: Settlement, def: BuildingDef, action: Action): { text: RawMessage; enabled: boolean } {
  const list = instances(s, def.id);
  const level = action.kind === "upgrade" ? list[action.index] ?? 0 : 0;
  const c = check(s, action);
  const name = buildingName(def.id);

  if (level >= 3) return { text: raw(name, { text: ": " }, levelName(3), { text: " ✔" }), enabled: false };

  const next = level + 1;
  const counter = def.perTier ? { text: ` (${list.length}/${def.perTier[tier(s)]})` } : { text: "" };
  const head =
    action.kind === "build"
      ? raw(t("bannerforge.ledger.build"), { text: " " }, name, counter, { text: " (" }, levelName(1), { text: ")" })
      : def.perTier
        ? raw(t("bannerforge.ledger.upgrade_one"), { text: " " }, name, { text: ": " }, levelName(level), { text: " → " }, levelName(next))
        : raw(t("bannerforge.ledger.upgrade"), { text: " " }, name, { text: ": " }, levelName(level), { text: " → " }, levelName(next));
  if (c.ok) return { text: raw(head, { text: " - " }, costText(c.cost)), enabled: true };
  return { text: raw(head, { text: "\n" }, reasonsText(c.reasons)), enabled: false };
}

interface Row {
  def: BuildingDef;
  slot: number; // which of rowActions() this button performs
  label: ObservableUIRawMessage;
  disabled: ObservableBoolean;
}

/**
 * The steward's ledger: status at the top, then every building grouped by section, each a button that says
 * exactly what it does. Buying updates the screen in place (DDUI observables), so the player never leaves it.
 */
export function showLedger(player: Player, s: Settlement): void {
  const status = new ObservableUIRawMessage(statusText(s));
  const notice = new ObservableUIRawMessage(t("bannerforge.ledger.hint"));
  const rows: Row[] = [];

  const form = new CustomForm(player, raw({ text: s.name }));
  form.label(status).divider().label(notice);

  for (const category of CATEGORIES) {
    form.header(t(`bannerforge.category.${category}`));
    for (const def of BUILDINGS.filter((b) => b.category === category)) {
      const slots = def.perTier ? 2 : 1;
      for (let slot = 0; slot < slots; slot++) {
        const row: Row = { def, slot, label: new ObservableUIRawMessage({ text: "" }), disabled: new ObservableBoolean(true) };
        rows.push(row);
        form.button(row.label, () => onRowClicked(player, s, row, refresh, notice), { disabled: row.disabled });
      }
    }
  }
  form.closeButton();

  function refresh(): void {
    status.setData(statusText(s));
    for (const row of rows) {
      const action = rowActions(s, row.def)[row.slot];
      if (!action) {
        // "Upgrade a House" before any house exists.
        row.label.setData(raw(t("bannerforge.ledger.upgrade_one"), { text: " " }, buildingName(row.def.id)));
        row.disabled.setData(true);
        continue;
      }
      const { text, enabled } = rowText(s, row.def, action);
      row.label.setData(text);
      row.disabled.setData(!enabled);
    }
  }
  refresh();
  form.show().catch((e) => console.warn(`[BannerForge] ledger: ${e}`));
}

function onRowClicked(player: Player, s: Settlement, row: Row, refresh: () => void, notice: ObservableUIRawMessage): void {
  const action = rowActions(s, row.def)[row.slot];
  if (!action) return;
  const c = check(s, action);
  if (!c.ok) {
    notice.setData(raw({ text: "§c" }, reasonsText(c.reasons)));
    return;
  }
  if (!canAfford(player, c.cost) || !pay(player, c.cost)) {
    notice.setData(raw(t("bannerforge.upgrade.cannot_afford"), { text: " " }, costText(c.cost)));
    return;
  }
  const oldTier = tier(s);
  apply(s, action, c.newLevel);
  saveSettlement(s);

  // Structures are not placed yet (roadmap M2): for now the purchase is recorded and reported here.
  const verb = action.kind === "build" ? "bannerforge.ledger.built" : "bannerforge.ledger.upgraded";
  const parts: RawMessage[] = [{ text: "§a" }, t(verb), { text: " " }, buildingName(row.def.id), { text: " (" }, levelName(c.newLevel), { text: ")" }];
  if (tier(s) !== oldTier) {
    const promoted = raw(t("bannerforge.tier.promoted", s.name), { text: " " }, t(`bannerforge.tier.${tier(s)}`), { text: "!" });
    parts.push({ text: "\n" }, promoted);
    world.sendMessage(promoted); // everyone else hears about it in chat
  }
  notice.setData(raw(...parts));
  refresh();
}

