import { type Player, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { FOUNDING_COST } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { showOverview } from "./ledger.js";
import { newSettlementId, saveSettlement, settlementNear } from "./registry.js";
import { costText, raw, say, t, txt } from "./text.js";
import { FACTIONS, SCHEMA, type Settlement, type Vec3 } from "./types.js";

const BELL_ID = "minecraft:bell";
/** Ignore repeat interactions from the same player within this many ticks (holding "use" fires repeatedly). */
const BELL_COOLDOWN_TICKS = 20;
/** A bell within this horizontal distance of an existing settlement belongs to it. */
const SETTLEMENT_RADIUS = 48;

/**
 * Option B (owner decision, 2026-11-12): ringing a village bell calls the steward.
 * - Unclaimed bell: the (neutral) steward answers and offers to found a settlement for a fee.
 * - Bell of an existing settlement: the steward answers with the ledger.
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
      showOverview(player, existing);
    } else {
      say(player, "bannerforge.bell.steward_arrives");
      void showClaimForm(player, dimensionId, { x, y, z });
    }
  });
}

/** "Amberwood Order (Green)" — used where the player picks a faction. */
const factionWithColour = (f: string) => raw(t(`bannerforge.faction.${f}`), txt(" ("), t(`bannerforge.colour.${f}`), txt(")"));

async function showClaimForm(player: Player, dimensionId: string, bell: Vec3): Promise<void> {
  if (!canAfford(player, FOUNDING_COST)) {
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), txt(" "), costText(FOUNDING_COST)));
    return;
  }
  const form = new ModalFormData()
    .title(t("bannerforge.claim.title"))
    .textField(raw(t("bannerforge.claim.name_label"), txt("\n§7"), t("bannerforge.claim.cost"), txt(" "), costText(FOUNDING_COST)), t("bannerforge.claim.name_placeholder"))
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
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), txt(" "), costText(FOUNDING_COST)));
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
  showOverview(player, settlement);
}
