import { type Player, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableNumber, ObservableString, ObservableUIRawMessage } from "@minecraft/server-ui";
import { FOUNDING_COST } from "./buildings.js";
import { canAfford, pay } from "./economy.js";
import { showOverview } from "./ledger.js";
import { newSettlementId, saveSettlement } from "./registry.js";
import { costText, raw, t, txt } from "./text.js";
import { FACTIONS, SCHEMA, type Settlement, type Vec3 } from "./types.js";

/** "Amberwood Order (Green)" — used where the player picks a faction. */
const factionWithColour = (f: string) => raw(t(`bannerforge.faction.${f}`), txt(" ("), t(`bannerforge.colour.${f}`), txt(")"));

/**
 * The neutral steward's founding form (opened by talking to them, see steward.ts).
 * `onFounded` runs before the settlement is first saved, so the caller can attach the steward to it.
 */
export function showClaimForm(player: Player, dimensionId: string, bell: Vec3, onFounded: (s: Settlement) => void): void {
  if (!canAfford(player, FOUNDING_COST)) {
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), txt(" "), costText(FOUNDING_COST)));
    return;
  }
  // Same DDUI style as the ledger (owner, play-test 2026-11-15).
  const nameValue = new ObservableString("", { clientWritable: true });
  const factionValue = new ObservableNumber(0, { clientWritable: true });
  const feedback = new ObservableUIRawMessage(txt(""));
  const feedbackVisible = new ObservableBoolean(false);
  const form = new CustomForm(player, t("bannerforge.claim.title"));
  form.label(raw(t("bannerforge.claim.cost"), txt(" "), costText(FOUNDING_COST)));
  form.spacer();
  form.textField(t("bannerforge.claim.name_label"), nameValue, { description: t("bannerforge.claim.name_placeholder") });
  form.dropdown(
    t("bannerforge.claim.faction_label"),
    factionValue,
    FACTIONS.map((f, i) => ({ label: factionWithColour(f), value: i })),
  );
  form.label(feedback, { visible: feedbackVisible });
  form.spacer();
  form.button(t("bannerforge.claim.submit"), () => {
    const name = String(nameValue.getData() ?? "").trim().slice(0, 32);
    if (!name) {
      feedback.setData(raw(t("bannerforge.claim.name_required")));
      feedbackVisible.setData(true);
      player.playSound("note.bass");
      return;
    }
    form.close();
    const picked = Number(factionValue.getData());
    console.log(`[BannerForge] founding: dropdown value ${String(factionValue.getData())} -> ${FACTIONS[picked] ?? "?"}`);
    system.run(() => found(player, dimensionId, bell, name, FACTIONS[picked] ?? FACTIONS[0], onFounded));
  });
  form.show().catch((e) => console.warn(`[BannerForge] founding form: ${e}`));
}

function found(player: Player, dimensionId: string, bell: Vec3, name: string, faction: Settlement["faction"], onFounded: (s: Settlement) => void): void {
  // Pay on submit: the player may have dropped emeralds while the form was open.
  if (!pay(player, FOUNDING_COST)) {
    player.sendMessage(raw(t("bannerforge.claim.cannot_afford"), txt(" "), costText(FOUNDING_COST)));
    return;
  }

  const settlement: Settlement = {
    schema: SCHEMA,
    id: newSettlementId(),
    name,
    faction,
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
