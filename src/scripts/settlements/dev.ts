// Developer menu for play-testing (owner, 2026-11-17: "insta building, time forward 1 day, insta settler etc.").
// Open with  /scriptevent bannerforge:dev  (needs cheats / operator, like every /scriptevent). While dev mode is on,
// the steward's ledger also shows a "Dev tools" button. Works on the settlement whose border you stand in (or the
// nearest one). Nothing here is reachable for normal players.

import { BlockVolume, ItemStack, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableUIRawMessage } from "@minecraft/server-ui";
import { celebrate } from "./celebration.js";
import { addSettlerNow, update } from "./citizens.js";
import { CITIZEN_ID, type CitizenRole, spawnCitizen } from "./citizen_npc.js";
import { hurryConstruction } from "./construction.js";
import { buildingById } from "./buildings.js";
import { devPlaceNow } from "./placement.js";
import { convertVillager, VILLAGER_ID } from "./convert.js";
import { SOLDIER_ID, type SoldierKind, spawnSoldier } from "./soldier.js";
import { captainTag, maintain } from "./garrison.js";
import { talk as talkToCaptain } from "./captain.js";
import { BOOK_ID, showOverview, showSection, useBook } from "./ledger.js";
import { onBellRung, onTalk, STEWARD_ID } from "./steward.js";
import { talk } from "./growth.js";
import { BORDER_RADIUS } from "./plots.js";
import { scanHouses } from "./vanilla_houses.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { military, freeBeds, freeSettlers, population, prosperity, promote, tier, waitingForWorkers } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

const DEV_LEDGER = "bannerforge:dev_ledger";

/** Is the "Dev tools" button shown in the ledger? Toggled from the dev menu, saved with the world. */
export const devButtonInLedger = (): boolean => world.getDynamicProperty(DEV_LEDGER) === true;

export function registerDevMenu(): void {
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.sourceEntity?.typeId !== "minecraft:player") return;
    if (e.id === "bannerforge:dev") showDevMenu(e.sourceEntity as Player);
    if (e.id === "bannerforge:census") census(e.sourceEntity as Player);
    if (e.id === "bannerforge:houses") houses(e.sourceEntity as Player);
    // Sets the free settlers (testing hiring and Recruit): "/scriptevent bannerforge:setfree 0". Extras leave.
    if (e.id === "bannerforge:setfree") {
      const s = nearest(e.sourceEntity as Player);
      if (s?.citizens) {
        s.citizens.free = Math.max(0, Number(e.message) || 0);
        saveSettlement(s);
        update(s);
      }
    }
    // Remote play-testing: stand next to the nearest bell (within 32 blocks), looking at it.
    if (e.id === "bannerforge:gotobell") {
      const p = e.sourceEntity as Player;
      const { x, y, z } = p.location;
      try {
        const vol = new BlockVolume({ x: x - 32, y: y - 40, z: z - 32 }, { x: x + 32, y: y + 16, z: z + 32 });
        const at = [...p.dimension.getBlocks(vol, { includeTypes: ["minecraft:bell"] }, true).getBlockLocationIterator()][0];
        if (!at) p.sendMessage("gotobell: no bell near");
        else {
          p.teleport({ x: at.x + 2.5, y: at.y, z: at.z + 0.5 }, { facingLocation: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 } });
          p.sendMessage(`gotobell: bell at ${at.x} ${at.y} ${at.z}`);
        }
      } catch (err) {
        p.sendMessage(`gotobell: ${String(err)}`);
      }
    }
    // Remote play-testing (2026-11-19): injected mouse clicks don't reach the game world, so this does what a
    // right-click on the NPC in view would do (steward: ledger or founding; newcomer: Welcome / Not now).
    // "/scriptevent bannerforge:build barracks": place a building in front of you, free; then "bannerforge:finish".
    if (e.id === "bannerforge:build") {
      const p = e.sourceEntity as Player;
      const s = nearest(p);
      const def = buildingById(e.message.trim());
      if (s && def) devPlaceNow(p, s, def);
      else p.sendMessage(`build: no settlement or no building "${e.message}"`);
    }
    if (e.id === "bannerforge:finish") (e.sourceEntity as Player).sendMessage(`finished ${hurryConstruction(e.sourceEntity as Player, "finish")} construction(s)`);
    // "/scriptevent bannerforge:soldier melee patrol": a soldier of the nearest town where you stand (testing duties).
    if (e.id === "bannerforge:soldier") {
      const p = e.sourceEntity as Player;
      const [kind, duty] = e.message.split(" ");
      const s = nearest(p);
      const sol = spawnSoldier(p.dimension, p.location, kind === "ranged" ? "ranged" : "melee", s?.faction ?? "blue", `dev:${system.currentTick}`, 1);
      if (duty === "patrol") sol.triggerEvent("bannerforge:patrol");
    }
    if (e.id === "bannerforge:promote") {
      const s = nearest(e.sourceEntity as Player);
      if (s) {
        promote(s);
        saveSettlement(s);
      }
    }
    if (e.id === "bannerforge:use") {
      const p = e.sourceEntity as Player;
      // Holding the ledger book: use it (right-click with the book).
      const held = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
      if (held?.typeId === BOOK_ID) return useBook(p, held);
      // The NPC in view, else the nearest steward or newcomer within 8 blocks (NPCs walk while commands are typed).
      const talkable = (x: { typeId: string; getProperty(k: string): unknown }) =>
        x.typeId === STEWARD_ID || (x.typeId === CITIZEN_ID && x.getProperty("bannerforge_settlements:role") === "applicant");
      const hit =
        p.getEntitiesFromViewDirection({ maxDistance: 12 })[0]?.entity ??
        p.dimension.getEntities({ location: p.location, maxDistance: 8, excludeTypes: ["minecraft:player"] }).find(talkable);
      let bell = hit ? undefined : p.getBlockFromViewDirection({ maxDistance: 8 })?.block;
      if (!hit && bell?.typeId !== "minecraft:bell") {
        // Or a bell within 4 blocks (it hangs under a roof the view often hits first).
        const { x, y, z } = p.location;
        const vol = new BlockVolume({ x: x - 4, y: y - 3, z: z - 4 }, { x: x + 4, y: y + 4, z: z + 4 });
        const at = [...p.dimension.getBlocks(vol, { includeTypes: ["minecraft:bell"] }, true).getBlockLocationIterator()][0];
        bell = at ? p.dimension.getBlock(at) : undefined;
      }
      if (bell?.typeId === "minecraft:bell") onBellRung(p, bell);
      else if (!hit) p.sendMessage("use: nothing in view");
      else if (hit.typeId === STEWARD_ID) onTalk(p, hit);
      else if (hit.typeId === CITIZEN_ID && hit.getProperty("bannerforge_settlements:role") === "applicant") talk(p, hit);
      else p.sendMessage(`use: ${hit.typeId} has no talk`);
    }
    // Opens the nearest settlement's ledger without the steward (testing): "/scriptevent bannerforge:ledger [economy]".
    if (e.id === "bannerforge:ledger") {
      const p = e.sourceEntity as Player;
      const s = nearest(p);
      if (s && e.message === "economy") showSection(p, s, "economy");
      else if (s) showOverview(p, s);
    }
    // The nearest settlement's duty board without walking to the Captain: "/scriptevent bannerforge:captain".
    if (e.id === "bannerforge:captain") {
      const p = e.sourceEntity as Player;
      const s = nearest(p);
      const c = s && p.dimension.getEntities({ type: SOLDIER_ID, tags: [captainTag(s)] })[0];
      if (c) talkToCaptain(p, c);
      else p.sendMessage("captain: none here");
    }
    // Door test (owner 2026-11-19: "check if AI can go through doors"): the nearest wooden door within 24 blocks is
    // closed, a soldier gets his post 3 blocks in front of it and is put 2 blocks behind it; he has to walk out.
    if (e.id === "bannerforge:doortest") doorTest(e.sourceEntity as Player, e.message === "citizen");
    if (e.id === "bannerforge:convert") convertNearby(e.sourceEntity as Player);
    if (e.id === "bannerforge:roster") roster(e.sourceEntity as Player);
    if (e.id === "bannerforge:dawn") {
      const s = nearest(e.sourceEntity as Player);
      if (s) update(s, true);
    }
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

  // Soldier prototype: its own entity (owner 2026-11-18), spawned where you stand; that spot is its post.
  form.header(t("bannerforge.dev.soldiers"));
  for (const kind of ["melee", "ranged"] as SoldierKind[]) {
    form.button(t(`bannerforge.dev.spawn_${kind}`), () => {
      const e = spawnSoldier(player.dimension, player.location, kind, s?.faction ?? "blue", `${Date.now()}`);
      done(t("bannerforge.dev.spawned", e.nameTag));
    });
  }
  form.button(t("bannerforge.dev.garrison_dawn"), () => {
    if (!s) return;
    maintain(s, true);
    done(t("bannerforge.dev.garrison_done"));
  });
  form.button(t("bannerforge.dev.remove_soldiers"), () => {
    let n = 0;
    for (const e of player.dimension.getEntities({ type: SOLDIER_ID, location: player.location, maxDistance: 64 })) {
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
 * Census (dev): every soldier, villager and citizen within 48 blocks, with its name, role,
 * job (variant) and whether it lies in a bed. Also  /scriptevent bannerforge:census . Plain text: dev only.
 */
function census(player: Player): void {
  const lines: string[] = [];
  for (const e of player.dimension.getEntities({ type: SOLDIER_ID, location: player.location, maxDistance: 96 })) {
    const p = e.location;
    const hp = e.getComponent("minecraft:health");
    lines.push(
      `SOL ${e.nameTag || "?"} ${String(e.getProperty("bannerforge_settlements:kind"))} r${String(e.getProperty("bannerforge_settlements:rank"))}` +
        ` hp=${hp ? Math.round(hp.currentValue) : "?"} duty=${String(e.getDynamicProperty("bannerforge:duty") ?? "-")}/${String(e.getProperty("bannerforge_settlements:duty"))}${e.getProperty("bannerforge_settlements:falling_back") ? " FALLING-BACK" : ""} @${p.x | 0},${p.z | 0}`,
    );
  }
  for (const type of [CITIZEN_ID, VILLAGER_ID]) {
    for (const e of player.dimension.getEntities({ type, location: player.location, maxDistance: 48 })) {
      const p = e.location;
      let role = "-";
      try {
        role = String(e.getProperty("bannerforge_settlements:role") ?? "-");
      } catch {
        // vanilla villagers have no role property
      }
      const job = e.getComponent("minecraft:variant")?.value ?? -1;
      const skin = e.getComponent("minecraft:skin_id")?.value ?? -1;
      const look = e.getComponent("minecraft:mark_variant")?.value ?? -1;
      const block = e.dimension.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
      const inBed = block?.typeId === "minecraft:bed";
      const kind = type === CITIZEN_ID ? "CIT" : "VAN";
      const hp = Math.round(e.getComponent("minecraft:health")?.currentValue ?? -1);
      lines.push(`${kind} ${e.nameTag || "?"} role=${role} job=${job} skin=${skin}/${look} hp=${hp} ${inBed ? "§aBED§r" : "awake"} @${p.x | 0},${p.z | 0}`);
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

/** Roster test (draft only): the nearest settlement's people with state, job and whether their entity is loaded. */
const nearest = (player: Player): Settlement | undefined =>
  allSettlements()
    .filter((x) => x.dimension === player.dimension.id)
    .sort((a, b) => dist(a, player) - dist(b, player))[0];

/** Research spike: which vanilla houses the nearest settlement has, by fingerprint (vanilla_houses.ts). */
function houses(player: Player): void {
  const s = nearest(player);
  if (!s) return;
  const started = system.currentTick;
  player.sendMessage(`${s.name}: looking for vanilla houses...`);
  // Also look again for adoption within a few seconds (normally once a day).
  delete s.housesDay;
  saveSettlement(s);
  scanHouses(player.dimension, s.center, BORDER_RADIUS[tier(s)], (r) => {
    const beds = r.houses.reduce((n, h) => n + h.beds, 0);
    const lines = r.houses.map((h) => `${h.id} x${h.beds} @${h.at.x} ${h.at.y} ${h.at.z} r${h.rot} ${(h.score * 100).toFixed(0)}%`);
    const loose = r.loose.map((v) => `${v.x} ${v.y} ${v.z}`).join(", ");
    player.sendMessage(`${r.houses.length} houses, ${beds} beds (${system.currentTick - started} ticks)\n${lines.join("\n")}\nloose beds: ${r.loose.length}${loose ? " " + loose : ""}`);
  });
}

function roster(player: Player): void {
  const s = nearest(player);
  if (!s) return;
  const c = s.citizens;
  const lines = (c?.people ?? []).map((p) => `${p.name} ${p.state}${p.job ? " @" + p.job : ""} ${p.eid ? (world.getEntity(p.eid) ? "seen" : "away") : "-"}`);
  const st = s.steward?.entityId ? world.getEntity(s.steward.entityId) : undefined;
  const at = (v: { x: number; y: number; z: number }) => `${Math.floor(v.x)} ${Math.floor(v.y)} ${Math.floor(v.z)}`;
  const steward = st ? `steward at ${at(st.location)}${st.hasTag("bannerforge:walking") ? " walking" : ""}` : "steward -";
  player.sendMessage(`${s.name}: bell ${at(s.center)}, ${steward}`);
  player.sendMessage(`${s.name}: day=${c?.day} now=${world.getDay()} free=${c?.free ?? 0} staffed=${JSON.stringify(c?.staffed ?? {})}\n${lines.join("\n")}`);
}
const dist = (s: Settlement, p: Player) => Math.hypot(s.center.x - p.location.x, s.center.z - p.location.z);

function doorTest(p: Player, citizen: boolean): void {
  const { x, y, z } = p.location;
  const vol = new BlockVolume({ x: x - 24, y: y - 6, z: z - 24 }, { x: x + 24, y: y + 6, z: z + 24 });
  const doors = [...p.dimension.getBlocks(vol, { includeTypes: ["minecraft:wooden_door", "minecraft:spruce_door", "minecraft:birch_door", "minecraft:jungle_door", "minecraft:acacia_door", "minecraft:dark_oak_door"] }, true).getBlockLocationIterator()];
  const lower = doors.map((l) => p.dimension.getBlock(l)).filter((b) => b && b.permutation.getState("upper_block_bit") === false);
  lower.sort((a, b) => Math.hypot(a!.x - x, a!.z - z) - Math.hypot(b!.x - x, b!.z - z));
  const door = lower[0];
  if (!door) return p.sendMessage("doortest: no wooden door within 24");
  const free = (dx: number, dz: number) => {
    const f = p.dimension.getBlock({ x: door.x + dx, y: door.y, z: door.z + dz });
    const h = p.dimension.getBlock({ x: door.x + dx, y: door.y + 1, z: door.z + dz });
    return !!f && !!h && f.isAir && h.isAir;
  };
  const axis = free(1, 0) && free(-1, 0) ? [1, 0] : free(0, 1) && free(0, -1) ? [0, 1] : undefined;
  if (!axis) return p.sendMessage(`doortest: door at ${door.x},${door.y},${door.z} has no free sides`);
  door.setPermutation(door.permutation.withState("open_bit", false));
  const out = { x: door.x + axis[0] * 3 + 0.5, y: door.y, z: door.z + axis[1] * 3 + 0.5 };
  const inside = { x: door.x - axis[0] * 2 + 0.5, y: door.y, z: door.z - axis[1] * 2 + 0.5 };
  const e = citizen ? spawnCitizen(p.dimension, out, "worker", "blue", "doortest") : spawnSoldier(p.dimension, out, "melee", "blue", "doortest", 1);
  if (citizen) e.triggerEvent("bannerforge:worker_shift");
  e.addTag("bannerforge:doortest");
  e.teleport(inside);
  p.sendMessage(`doortest: door ${door.x},${door.y},${door.z} closed; ${e.nameTag} must walk from ${inside.x | 0},${inside.z | 0} to ${out.x | 0},${out.z | 0}`);
}
