// Developer menu for play-testing (owner, 2026-11-17: "insta building, time forward 1 day, insta settler etc.").
// Open with  /scriptevent bannerforge:dev  (needs cheats / operator, like every /scriptevent). While dev mode is on,
// the steward's ledger also shows a "Dev tools" button. Works on the settlement whose border you stand in (or the
// nearest one). Nothing here is reachable for normal players.

import { ItemStack, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableUIRawMessage } from "@minecraft/server-ui";
import { hurryConstruction } from "./construction.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { checkPromotion, defence, population, prosperity, promote, tier } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

const DEV_LEDGER = "bannerforge:dev_ledger";

/** Is the "Dev tools" button shown in the ledger? Toggled from the dev menu, saved with the world. */
export const devButtonInLedger = (): boolean => world.getDynamicProperty(DEV_LEDGER) === true;

export function registerDevMenu(): void {
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id !== "bannerforge:dev" || e.sourceEntity?.typeId !== "minecraft:player") return;
    showDevMenu(e.sourceEntity as Player);
  });
}

/** The settlement the player stands in or nearest to, in their dimension. */
function nearestSettlement(player: Player): Settlement | undefined {
  let best: Settlement | undefined;
  let bestD = Infinity;
  for (const s of allSettlements()) {
    if (s.dimension !== player.dimension.id) continue;
    const d = Math.max(Math.abs(s.center.x - player.location.x), Math.abs(s.center.z - player.location.z));
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Moves the world clock forward. Construction and steward timers use the calendar, so they move with it. */
function addTime(player: Player, ticks: number): void {
  player.runCommand(`time add ${Math.round(ticks)}`);
}

export function showDevMenu(player: Player): void {
  const form = new CustomForm(player, t("bannerforge.dev.title"));
  const status = new ObservableUIRawMessage(txt(""));
  const result = new ObservableUIRawMessage(txt(""));
  let s = nearestSettlement(player);

  const refresh = () => {
    s = s ? settlementById(s.id) ?? s : nearestSettlement(player);
    if (!s) {
      status.setData(raw(txt("§c"), t("bannerforge.dev.no_settlement")));
      return;
    }
    status.setData(
      raw(
        txt(`§f${s.name} · `),
        t(`bannerforge.tier.${tier(s)}`),
        txt(`\n§7`),
        t("bannerforge.steward.prosperity"),
        txt(` ${prosperity(s)}  `),
        t("bannerforge.steward.population"),
        txt(` ${population(s)}  `),
        t("bannerforge.steward.defence"),
        txt(` ${defence(s)}`),
      ),
    );
  };
  const done = (msg: RawMessage) => {
    result.setData(raw(txt("§a"), msg));
    player.playSound("random.orb", { volume: 0.5 });
    // Settlement data changes on the next tick (construction catch-up): show it a moment later.
    system.runTimeout(refresh, 25);
    refresh();
  };

  form.label(status);
  form.label(result);
  form.divider();
  form.header(t("bannerforge.dev.construction"));
  form.button(t("bannerforge.dev.finish"), () => done(t("bannerforge.dev.sites", String(hurryConstruction(player, "finish")))));
  form.button(t("bannerforge.dev.phase"), () => done(t("bannerforge.dev.sites", String(hurryConstruction(player, "phase")))));

  form.header(t("bannerforge.dev.time"));
  form.button(t("bannerforge.dev.day"), () => {
    addTime(player, 24000);
    done(t("bannerforge.dev.day_done"));
  });
  form.button(t("bannerforge.dev.morning"), () => {
    // Sunrise is tick 0 of the day; anything after it waits for the next one.
    addTime(player, (24000 - world.getTimeOfDay()) % 24000 || 24000);
    done(t("bannerforge.dev.morning_done"));
  });

  form.header(t("bannerforge.dev.settlement"));
  form.button(t("bannerforge.dev.emeralds"), () => {
    player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack("minecraft:emerald", 64));
    done(t("bannerforge.dev.emeralds_done"));
  });
  form.button(t("bannerforge.dev.promote"), () => {
    if (!s) return;
    const missing = checkPromotion(s).reasons.length;
    promote(s);
    saveSettlement(s);
    done(raw(t(`bannerforge.tier.${tier(s)}`), txt(missing ? " (dev)" : "")));
  });
  form.button(t("bannerforge.dev.demote"), () => {
    if (!s) return;
    s.tier = "village";
    saveSettlement(s);
    done(t("bannerforge.tier.village"));
  });
  // Settlers come with the citizens (M2.5): this button starts working then.
  form.button(t("bannerforge.dev.settler"), () => done(t("bannerforge.dev.not_yet")));

  form.header(t("bannerforge.dev.options"));
  form.button(raw(t("bannerforge.dev.ledger_button"), txt(devButtonInLedger() ? ": ON" : ": OFF")), () => {
    world.setDynamicProperty(DEV_LEDGER, !devButtonInLedger());
    form.close();
    system.run(() => showDevMenu(player));
  });
  form.button(t("bannerforge.dev.close"), () => form.close());

  refresh();
  form.show().catch((e) => console.warn(`[BannerForge] dev menu: ${e}`));
}
