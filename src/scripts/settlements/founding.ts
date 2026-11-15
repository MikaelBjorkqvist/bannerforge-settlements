import { type Player, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { FOUNDING_COST } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { showOverview } from "./ledger.js";
import { newSettlementId, saveSettlement } from "./registry.js";
import { costText, raw, say, t, txt } from "./text.js";
import { FACTIONS, SCHEMA, type Settlement, type Vec3 } from "./types.js";

/** "Amberwood Order (Green)" — used where the player picks a faction. */
const factionWithColour = (f: string) => raw(t(`bannerforge.faction.${f}`), txt(" ("), t(`bannerforge.colour.${f}`), txt(")"));

/**
 * The neutral steward's founding form (opened by talking to them, see steward.ts).
 * `onFounded` runs before the settlement is first saved, so the caller can attach the steward to it.
 */
export async function showClaimForm(player: Player, dimensionId: string, bell: Vec3, onFounded: (s: Settlement) => void): Promise<void> {
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
  // The emeralds are paid: the settlement must be saved even if attaching the steward fails.
  try {
    onFounded(settlement);
  } catch (err) {
    console.warn(`[BannerForge] founding: could not attach the steward: ${String(err)}`);
  }
  saveSettlement(settlement);
  player.playSound("random.levelup");
  world.sendMessage(raw(t("bannerforge.claim.announce", player.name, name)));
  showOverview(player, settlement);
}
