import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { BUILDINGS, FOUNDING_COST, levelOf, nextCost, prosperityGain, tierFor, type BuildingDef, type Cost } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { newSettlementId, saveSettlement, settlementNear } from "./registry.js";
import { FACTIONS, type BuildingLevel, type Settlement } from "./types.js";

const BELL_ID = "minecraft:bell";
/** Ignore repeat interactions from the same player within this many ticks (holding "use" fires repeatedly). */
const BELL_COOLDOWN_TICKS = 20;
/** A bell within this horizontal distance of an existing settlement belongs to it. */
const SETTLEMENT_RADIUS = 48;

const t = (key: string, ...args: string[]): RawMessage =>
  args.length ? { translate: key, with: args } : { translate: key };

function say(player: Player, key: string, ...args: string[]): void {
  player.sendMessage({ rawtext: [t(key, ...args)] });
}

/** "Amberwood Order (Green)" — used where the player picks a faction. */
function factionWithColour(f: string): RawMessage {
  return { rawtext: [t(`bannerforge.faction.${f}`), { text: " (" }, t(`bannerforge.colour.${f}`), { text: ")" }] };
}

/** "12 Emeralds" style text for a cost list. */
function costText(costs: Cost[]): RawMessage {
  const parts: RawMessage[] = [];
  costs.forEach((c, i) => {
    if (i > 0) parts.push({ text: ", " });
    parts.push({ text: `${c.amount} ` }, t(`bannerforge.currency.${c.item.replace(":", ".")}`));
  });
  return { rawtext: parts };
}

/**
 * Option B (owner decision, 2026-11-12): ringing a village bell calls the steward.
 * - Unclaimed bell: the steward answers and offers to found a settlement.
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
    player.sendMessage({ rawtext: [t("bannerforge.claim.cannot_afford"), { text: " " }, costText(FOUNDING_COST)] });
    return;
  }
  const form = new ModalFormData()
    .title(t("bannerforge.claim.title"))
    .textField({ rawtext: [t("bannerforge.claim.name_label"), { text: "\n§7" }, t("bannerforge.claim.cost"), { text: " " }, costText(FOUNDING_COST)] }, t("bannerforge.claim.name_placeholder"))
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
    player.sendMessage({ rawtext: [t("bannerforge.claim.cannot_afford"), { text: " " }, costText(FOUNDING_COST)] });
    return;
  }

  const settlement: Settlement = {
    schema: 1,
    id: newSettlementId(),
    name,
    faction: FACTIONS[Number(factionIndex) || 0],
    tier: "village",
    prosperity: 0,
    dimension: dimensionId,
    center: bell,
    foundedBy: player.id,
    foundedAt: system.currentTick,
    buildings: {},
  };
  saveSettlement(settlement);
  world.sendMessage({ rawtext: [t("bannerforge.claim.announce", player.name, name)] });
  await showStewardMenu(player, settlement);
}

async function showStewardMenu(player: Player, s: Settlement): Promise<void> {
  const body: RawMessage = {
    rawtext: [
      t("bannerforge.steward.faction"), { text: ": " }, t(`bannerforge.faction.${s.faction}`), { text: "\n" },
      t("bannerforge.steward.tier"), { text: ": " }, t(`bannerforge.tier.${s.tier}`), { text: "\n" },
      t("bannerforge.steward.prosperity"), { text: `: ${s.prosperity}\n\n` },
      t("bannerforge.steward.greeting"),
    ],
  };

  const form = new ActionFormData()
    .title({ rawtext: [{ text: s.name }] })
    .body(body)
    .button(t("bannerforge.steward.upgrades"))
    .button(t("bannerforge.steward.close"));

  const response = await form.show(player);
  if (response.canceled) return;
  if (response.selection === 0) await showUpgradeMenu(player, s);
}

async function showUpgradeMenu(player: Player, s: Settlement): Promise<void> {
  const form = new ActionFormData()
    .title(t("bannerforge.upgrade.title"))
    .body(t("bannerforge.upgrade.body"));

  for (const b of BUILDINGS) {
    const level = levelOf(s, b.id);
    const line: RawMessage[] = [t(`bannerforge.building.${b.id}`), { text: " - " }, t(`bannerforge.level.${level}`)];
    const cost = nextCost(b, level);
    if (cost) line.push({ text: "\n§8" }, t(`bannerforge.level.${level + 1}`), { text: ": " }, costText(cost));
    else line.push({ text: "\n§8" }, t("bannerforge.upgrade.max"));
    form.button({ rawtext: line });
  }
  form.button(t("bannerforge.upgrade.back"));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const building = BUILDINGS[response.selection];
  if (!building) return showStewardMenu(player, s);
  upgrade(player, s, building);
  await showUpgradeMenu(player, s);
}

function upgrade(player: Player, s: Settlement, b: BuildingDef): void {
  const level = levelOf(s, b.id);
  const cost = nextCost(b, level);
  if (!cost) {
    say(player, "bannerforge.upgrade.already_max");
    return;
  }
  if (!canAfford(player, cost) || !pay(player, cost)) {
    player.sendMessage({ rawtext: [t("bannerforge.upgrade.cannot_afford"), { text: " " }, costText(cost)] });
    return;
  }

  const newLevel = (level + 1) as BuildingLevel;
  s.buildings[b.id] = newLevel;
  s.prosperity += prosperityGain(b, level);
  const oldTier = s.tier;
  s.tier = tierFor(s.prosperity);
  saveSettlement(s);

  // Structures are not placed yet (roadmap M2): for now the upgrade is recorded and announced.
  player.sendMessage({
    rawtext: [
      t("bannerforge.upgrade.done", s.name), { text: " " },
      t(`bannerforge.building.${b.id}`), { text: " → " }, t(`bannerforge.level.${newLevel}`),
    ],
  });
  if (s.tier !== oldTier) {
    world.sendMessage({ rawtext: [t("bannerforge.tier.promoted", s.name), { text: " " }, t(`bannerforge.tier.${s.tier}`), { text: "!" }] });
  }
}
