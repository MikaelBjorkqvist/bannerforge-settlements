// Developer menu for play-testing (owner, 2026-11-17: "insta building, time forward 1 day, insta settler etc.").
// Open with  /scriptevent bannerforge:dev  (needs cheats / operator, like every /scriptevent). While dev mode is on,
// the steward's ledger also shows a "Dev tools" button. Works on the settlement whose border you stand in (or the
// nearest one). Nothing here is reachable for normal players.

import { ItemStack, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableUIRawMessage } from "@minecraft/server-ui";
import { celebrate } from "./celebration.js";
import { addSettlerNow, update } from "./citizens.js";
import { CITIZEN_ID, type CitizenRole, spawnCitizen } from "./citizen_npc.js";
import { hurryConstruction } from "./construction.js";
import { convertVillager, VILLAGER_ID } from "./convert.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { military, freeBeds, freeSettlers, population, prosperity, promote, tier, waitingForWorkers } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

const DEV_LEDGER = "bannerforge:dev_ledger";
const LAB_ID = "bannerforge_settlements:lab_villager";

/** Is the "Dev tools" button shown in the ledger? Toggled from the dev menu, saved with the world. */
export const devButtonInLedger = (): boolean => world.getDynamicProperty(DEV_LEDGER) === true;

export function registerDevMenu(): void {
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.sourceEntity?.typeId !== "minecraft:player") return;
    if (e.id === "bannerforge:dev") showDevMenu(e.sourceEntity as Player);
    if (e.id === "bannerforge:census") census(e.sourceEntity as Player);
    if (e.id === "bannerforge:convert") convertNearby(e.sourceEntity as Player);
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
        t("bannerforge.category.military"),
        txt(` ${military(s)}\n§7`),
        t("bannerforge.citizens.free"),
        txt(` ${freeSettlers(s)}  `),
        t("bannerforge.citizens.free_beds"),
        txt(` ${freeBeds(s)}  `),
        t("bannerforge.citizens.waiting"),
        txt(` ${waitingForWorkers(s).length}`),
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
    promote(s);
    saveSettlement(s);
    form.close();
    celebrate(s);
  });
  form.button(t("bannerforge.dev.demote"), () => {
    if (!s) return;
    s.tier = "village";
    saveSettlement(s);
    done(t("bannerforge.tier.village"));
  });
  form.button(t("bannerforge.dev.settler"), () => {
    if (!s) return;
    done(addSettlerNow(s) ? t("bannerforge.dev.settler_done") : t("bannerforge.dev.no_bed"));
  });
  form.button(t("bannerforge.dev.dawn"), () => {
    if (!s) return;
    update(s, true);
    done(t("bannerforge.dev.dawn_done"));
  });

  // Citizen prototype (M2.5 step 2): spawn one where you stand and watch it through a day with the time buttons.
  form.header(t("bannerforge.dev.npcs"));
  for (const role of ["settler", "worker", "guard"] as CitizenRole[]) {
    form.button(t(`bannerforge.dev.spawn_${role}`), () => {
      const e = spawnCitizen(player.dimension, player.location, role, s?.faction ?? "blue", `${Date.now()}`);
      done(t("bannerforge.dev.spawned", e.nameTag));
    });
  }
  form.button(t("bannerforge.dev.remove_citizens"), () => {
    let n = 0;
    for (const e of player.dimension.getEntities({ type: CITIZEN_ID, location: player.location, maxDistance: 64 })) {
      e.remove();
      n++;
    }
    done(t("bannerforge.dev.removed", String(n)));
  });

  // Citizen research lab (draft only): an exact villager_v2 copy under our identifier, next to vanilla villagers.
  form.header(t("bannerforge.dev.lab"));
  form.button(t("bannerforge.dev.lab_spawn"), () => {
    player.dimension.spawnEntity(LAB_ID, player.location);
    done(t("bannerforge.dev.spawned", LAB_ID));
  });
  form.button(t("bannerforge.dev.lab_report"), () => {
    form.close();
    census(player);
  });
  form.button(t("bannerforge.dev.lab_remove"), () => {
    let n = 0;
    for (const e of player.dimension.getEntities({ type: LAB_ID, location: player.location, maxDistance: 64 })) {
      e.remove();
      n++;
    }
    done(t("bannerforge.dev.removed", String(n)));
  });

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

/**
 * Citizen lab census (draft only): every villager, lab villager and citizen within 48 blocks, with its name, role,
 * job (variant) and whether it lies in a bed. Also  /scriptevent bannerforge:census . Plain text: dev only.
 */
function census(player: Player): void {
  const lines: string[] = [];
  for (const type of [CITIZEN_ID, LAB_ID, VILLAGER_ID]) {
    for (const e of player.dimension.getEntities({ type, location: player.location, maxDistance: 48 })) {
      const p = e.location;
      let role = "-";
      try {
        role = String(e.getProperty("bannerforge_settlements:role") ?? "-");
      } catch {
        // vanilla and lab villagers have no role property
      }
      const job = e.getComponent("minecraft:variant")?.value ?? -1;
      const skin = e.getComponent("minecraft:skin_id")?.value ?? -1;
      const look = e.getComponent("minecraft:mark_variant")?.value ?? -1;
      const block = e.dimension.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
      const inBed = block?.typeId === "minecraft:bed";
      const kind = type === CITIZEN_ID ? "CIT" : type === LAB_ID ? "LAB" : "VAN";
      lines.push(`${kind} ${e.nameTag || "?"} role=${role} job=${job} skin=${skin}/${look} ${inBed ? "§aBED§r" : "awake"} @${p.x | 0},${p.z | 0}`);
    }
  }
  player.sendMessage(lines.length ? lines.join("\n") : "census: nobody within 48");
}

/** Conversion test (draft only): every vanilla villager within 8 blocks becomes a citizen.  /scriptevent bannerforge:convert */
function convertNearby(player: Player): void {
  let n = 0;
  for (const v of player.dimension.getEntities({ type: VILLAGER_ID, location: player.location, maxDistance: 8 })) {
    if (convertVillager(v)) n++;
  }
  player.sendMessage(`converted ${n} villager(s)`);
}
