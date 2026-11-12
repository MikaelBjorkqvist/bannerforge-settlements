import { type Player, type RawMessage, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { findNearestBell } from "./find_bell.js";
import { newSettlementId, saveSettlement, settlementNear } from "./registry.js";
import { FACTIONS, type Settlement } from "./types.js";

export const CHARTER_ID = "bannerforge:steward_charter";
/** A bell within this horizontal distance of an existing settlement belongs to it. */
const SETTLEMENT_RADIUS = 48;

const t = (key: string, ...args: string[]): RawMessage =>
  args.length ? { translate: key, with: args } : { translate: key };

function say(player: Player, key: string, ...args: string[]): void {
  player.sendMessage({ rawtext: [t(key, ...args)] });
}

export function registerStewardCharter(): void {
  world.afterEvents.itemUse.subscribe((event) => {
    if (event.itemStack.typeId !== CHARTER_ID) return;
    void openCharter(event.source);
  });
}

async function openCharter(player: Player): Promise<void> {
  const dimension = player.dimension;
  const existing = settlementNear(dimension.id, player.location, SETTLEMENT_RADIUS);
  if (existing) {
    await showStewardMenu(player, existing);
    return;
  }

  say(player, "bannerforge.charter.searching");
  const bell = await findNearestBell(dimension, player.location);
  if (!bell) {
    say(player, "bannerforge.charter.no_village");
    return;
  }
  await showClaimForm(player, dimension.id, bell);
}

async function showClaimForm(player: Player, dimensionId: string, bell: { x: number; y: number; z: number }): Promise<void> {
  const form = new ModalFormData()
    .title(t("bannerforge.claim.title"))
    .textField(t("bannerforge.claim.name_label"), t("bannerforge.claim.name_placeholder"))
    .dropdown(t("bannerforge.claim.faction_label"), FACTIONS.map((f) => t(`bannerforge.faction.${f}`)))
    .submitButton(t("bannerforge.claim.submit"));

  const response = await form.show(player);
  if (response.canceled || !response.formValues) return;

  const [rawName, factionIndex] = response.formValues;
  const name = String(rawName ?? "").trim().slice(0, 32);
  if (!name) {
    say(player, "bannerforge.claim.name_required");
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
  if (response.selection === 0) say(player, "bannerforge.steward.upgrades_soon");
}
