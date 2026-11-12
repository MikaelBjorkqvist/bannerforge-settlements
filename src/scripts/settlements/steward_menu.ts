import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { BUILDINGS, FOUNDING_COST, PROMOTION, type BuildingDef, type Category, type Cost } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { newSettlementId, saveSettlement, settlementNear } from "./registry.js";
import { apply, check, highest, housing, instances, npcDemand, population, prosperity, tier, type Action, type Reason } from "./rules.js";
import { FACTIONS, SCHEMA, type Settlement } from "./types.js";

const BELL_ID = "minecraft:bell";
/** Ignore repeat interactions from the same player within this many ticks (holding "use" fires repeatedly). */
const BELL_COOLDOWN_TICKS = 20;
/** A bell within this horizontal distance of an existing settlement belongs to it. */
const SETTLEMENT_RADIUS = 48;
const CATEGORIES: Category[] = ["core", "housing", "economy", "crafts", "civic", "defence", "military"];

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

function reasonText(r: Reason): RawMessage {
  const key = `bannerforge.rule.${r.key}`;
  if (!r.args.length) return { translate: key };
  return { translate: key, with: raw(...r.args.map((a, i) => (r.translateArgs?.includes(i) ? { translate: a } : { text: a }))) };
}

function reasonsText(reasons: Reason[]): RawMessage {
  const parts: RawMessage[] = [];
  reasons.forEach((r, i) => {
    if (i > 0) parts.push({ text: ", " });
    parts.push(reasonText(r));
  });
  return raw(...parts);
}

const buildingName = (id: string) => t(`bannerforge.building.${id}`);
const levelName = (level: number) => t(`bannerforge.level.${level}`);

// ---------- bell: founding or steward ----------

/**
 * Option B (owner decision, 2026-11-12): ringing a village bell calls the steward.
 * - Unclaimed bell: the (neutral) steward answers and offers to found a settlement for a fee.
 * - Bell of an existing settlement: the steward answers with the settlement menu.
 * Until the steward NPC exists (roadmap M1), the steward's menus open straight from the bell.
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
      void showStewardMenu(player, existing);
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
  await showStewardMenu(player, settlement);
}

// ---------- steward report ----------

/** The steward's report: status, population and progress toward the next tier. */
function reportText(s: Settlement): RawMessage {
  const tr = tier(s);
  const parts: RawMessage[] = [
    t("bannerforge.steward.faction"), { text: ": " }, t(`bannerforge.faction.${s.faction}`), { text: "\n" },
    t("bannerforge.steward.tier"), { text: ": " }, t(`bannerforge.tier.${tr}`), { text: "\n" },
    t("bannerforge.steward.prosperity"), { text: `: ${prosperity(s)}\n` },
    t("bannerforge.steward.population"), { text: `: ${population(s)} / ${housing(s)}` },
  ];
  const unstaffed = npcDemand(s) - population(s);
  if (unstaffed > 0) parts.push({ text: " §6(" }, t("bannerforge.steward.unstaffed", String(unstaffed)), { text: ")§r" });

  const nextTier = tr === "village" ? "town" : tr === "town" ? "city" : undefined;
  if (nextTier) {
    const promo = PROMOTION[nextTier];
    const mark = (ok: boolean): RawMessage => ({ text: ok ? " §a✔§r" : " §c✘§r" });
    parts.push({ text: "\n\n" }, t("bannerforge.steward.next_tier"), { text: " " }, t(`bannerforge.tier.${nextTier}`), { text: ":\n" });
    parts.push({ text: "- " }, t("bannerforge.steward.prosperity"), { text: ` ${prosperity(s)} / ${promo.prosperity}` }, mark(prosperity(s) >= promo.prosperity), { text: "\n" });
    parts.push({ text: "- " }, t("bannerforge.steward.population"), { text: ` ${population(s)} / ${promo.population}` }, mark(population(s) >= promo.population), { text: "\n" });
    for (const r of promo.requires) {
      parts.push({ text: "- " }, buildingName(r.id), { text: " " }, levelName(r.level), mark(highest(s, r.id) >= r.level), { text: "\n" });
    }
    parts.push({ text: "- " }, buildingName("town_hall"), { text: " " }, levelName(promo.townHallLevel), { text: " §7(" }, t("bannerforge.steward.promotes"), { text: ")§r" });
  }
  return raw(...parts);
}

async function showStewardMenu(player: Player, s: Settlement, notice?: RawMessage): Promise<void> {
  const body = notice ? raw(notice, { text: "\n\n" }, reportText(s)) : reportText(s);
  const form = new ActionFormData()
    .title(raw({ text: s.name }))
    .body(body)
    .button(t("bannerforge.steward.upgrades"))
    .button(t("bannerforge.steward.close"));
  const response = await form.show(player);
  if (response.canceled) return;
  if (response.selection === 0) await showCategoryMenu(player, s);
}

// ---------- commission works ----------

const withNotice = (notice: RawMessage | undefined, body: RawMessage) => (notice ? raw(notice, { text: "\n\n" }, body) : body);

async function showCategoryMenu(player: Player, s: Settlement): Promise<void> {
  const form = new ActionFormData().title(t("bannerforge.upgrade.title")).body(t("bannerforge.upgrade.body"));
  for (const c of CATEGORIES) form.button(t(`bannerforge.category.${c}`));
  form.button(t("bannerforge.upgrade.back"));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const category = CATEGORIES[response.selection];
  if (!category) return showStewardMenu(player, s);
  await showBuildingList(player, s, category);
}

/** One button per building in the category: current level, then the next step's cost or why it is locked. */
async function showBuildingList(player: Player, s: Settlement, category: Category, notice?: RawMessage): Promise<void> {
  const defs = BUILDINGS.filter((b) => b.category === category);
  const form = new ActionFormData().title(t(`bannerforge.category.${category}`)).body(withNotice(notice, t("bannerforge.upgrade.body")));

  for (const def of defs) {
    if (def.perTier) {
      const n = instances(s, def.id).length;
      form.button(raw(buildingName(def.id), { text: ` §8(${n}/${def.perTier[tier(s)]})` }));
    } else {
      form.button(buildingButton(s, def, uniqueAction(s, def)));
    }
  }
  form.button(t("bannerforge.upgrade.back"));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const def = defs[response.selection];
  if (!def) return showCategoryMenu(player, s);
  if (def.perTier) return showInstanceList(player, s, def);
  await showBuildingList(player, s, category, perform(player, s, def, uniqueAction(s, def)));
}

const uniqueAction = (s: Settlement, def: BuildingDef): Action =>
  instances(s, def.id).length ? { kind: "upgrade", id: def.id, index: 0 } : { kind: "build", id: def.id };

/** Repeatable buildings (houses, gates, towers): one button per instance plus "build new". */
async function showInstanceList(player: Player, s: Settlement, def: BuildingDef, notice?: RawMessage): Promise<void> {
  const count = instances(s, def.id).length;
  const form = new ActionFormData().title(buildingName(def.id)).body(withNotice(notice, t("bannerforge.upgrade.body")));
  const actions: Action[] = [];
  for (let index = 0; index < count; index++) actions.push({ kind: "upgrade", id: def.id, index });
  actions.push({ kind: "build", id: def.id });
  actions.forEach((a, i) => form.button(buildingButton(s, def, a, i < count ? i + 1 : undefined)));
  form.button(t("bannerforge.upgrade.back"));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const action = actions[response.selection];
  if (!action) return showBuildingList(player, s, def.category);
  await showInstanceList(player, s, def, perform(player, s, def, action));
}

function buildingButton(s: Settlement, def: BuildingDef, action: Action, number?: number): RawMessage {
  const level = action.kind === "upgrade" ? instances(s, def.id)[action.index] ?? 0 : 0;
  const title: RawMessage[] =
    action.kind === "build" && def.perTier
      ? [t("bannerforge.upgrade.build_new")]
      : [buildingName(def.id), { text: number ? ` #${number} - ` : " - " }, levelName(level)];
  const c = check(s, action);
  const detail: RawMessage = c.ok
    ? raw({ text: "\n§8" }, levelName(c.newLevel), { text: ": " }, costText(c.cost))
    : raw({ text: "\n§4" }, reasonsText(c.reasons));
  return raw(...title, detail);
}

/** Checks, pays and applies an action. Returns the result text for the reopened menu. */
function perform(player: Player, s: Settlement, def: BuildingDef, action: Action): RawMessage {
  const c = check(s, action);
  if (!c.ok) return raw({ text: "§c" }, reasonsText(c.reasons));
  if (!canAfford(player, c.cost) || !pay(player, c.cost)) {
    return raw(t("bannerforge.upgrade.cannot_afford"), { text: " " }, costText(c.cost));
  }
  const oldTier = tier(s);
  apply(s, action, c.newLevel);
  saveSettlement(s);

  // Structures are not placed yet (roadmap M2): for now the upgrade is recorded and reported.
  const result: RawMessage[] = [
    t("bannerforge.upgrade.done", s.name), { text: " " }, buildingName(def.id), { text: " → " }, levelName(c.newLevel),
    { text: "\n§7" }, t("bannerforge.steward.prosperity"), { text: `: ${prosperity(s)}` },
  ];
  if (tier(s) !== oldTier) {
    const promoted = raw(t("bannerforge.tier.promoted", s.name), { text: " " }, t(`bannerforge.tier.${tier(s)}`), { text: "!" });
    result.push({ text: "\n" }, promoted);
    world.sendMessage(promoted); // everyone else hears about it in chat
  }
  return raw(...result);
}
