// The Captain's duty board (owner 2026-11-19: the Captain and the player choose duties). Talking to the Captain lists
// every soldier slot with its duty; picking one offers the duties that soldier can take, or the Captain's own choice.
// The garrison pass then walks the soldier to his new spot (garrison.ts reassign).

import { type Entity, type Player, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean } from "@minecraft/server-ui";
import { setRank, shiftTask, slotRank, slots, taskCounts, TASKS, TRAIN_COST, type Slot } from "./duties.js";
import { canAfford, pay } from "./economy.js";
import { garrisonRank } from "./rules.js";
import { captainTag, maintain, P_DUTY, postTag } from "./garrison.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { SOLDIER_ID, soldierTitle } from "./soldier.js";
import { raw, t, txt } from "./text.js";
import type { Role, Settlement } from "./types.js";

const COOLDOWN_TICKS = 10;
/** The foods soldiers can be fed (soldier.json minecraft:healable). */
const FOOD = new Set(["minecraft:bread", "minecraft:baked_potato", "minecraft:cooked_beef", "minecraft:cooked_porkchop",
  "minecraft:cooked_mutton", "minecraft:cooked_chicken", "minecraft:cooked_cod", "minecraft:cooked_salmon",
  "minecraft:golden_carrot", "minecraft:golden_apple"]);
const lastUse = new Map<string, number>();

export function registerCaptain(): void {
  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const { player, target } = event;
    if (target.typeId !== SOLDIER_ID || !target.getTags().some((x) => x.startsWith("bannerforge:captain:"))) return;
    // Food on a hurt Captain feeds him (soldier.json healable) instead of opening the board.
    const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
    const hp = target.getComponent("minecraft:health");
    if (held && FOOD.has(held.typeId) && hp && hp.currentValue < hp.effectiveMax) return;
    event.cancel = true;
    const now = system.currentTick;
    if (now - (lastUse.get(player.id) ?? -COOLDOWN_TICKS) < COOLDOWN_TICKS) return;
    lastUse.set(player.id, now);
    system.run(() => talk(player, target));
  });
}

/** Opens the duty board of the Captain's settlement. */
export function talk(player: Player, captain: Entity): void {
  const s = allSettlements().find((x) => captain.hasTag(captainTag(x)));
  if (!s) return;
  board(player, s, captain.nameTag);
}

/** Closes the current screen and opens the next one on the following tick (as the Ledger does). */
function go(form: CustomForm, next: () => void): void {
  form.close();
  system.run(next);
}

const roleName = (r: Role) => t(`bannerforge.duty.role.${r}`);

function soldierOf(s: Settlement, slot: Slot): Entity | undefined {
  const dim = world.getDimension(s.dimension);
  return dim.getEntities({ type: SOLDIER_ID, tags: [postTag(s, slot.post)] }).find((e) => Number(e.getDynamicProperty(P_DUTY)) === slot.n);
}

/** "Hal" from "Soldier, Hal". */
const shortName = (e: Entity | undefined) => e?.nameTag.split(", ")[1] ?? e?.nameTag ?? "";

/**
 * The duty board (owner 2026-11-19: no list of soldiers; "add more or less to X task"). Each task shows how many
 * soldiers it has, with one button to send one more from the barracks and one to call one back. Training picks the
 * next soldier who can be trained.
 */
function board(player: Player, s: Settlement, title: string): void {
  const all = slots(s, (p) => postTag(s, p));
  const counts = taskCounts(all);
  const waiting = counts.barracks ?? 0;
  const archers = all.filter((x) => x.post.kind === "ranged").length;
  const form = new CustomForm(player, raw(txt(title)));
  if (!all.length) form.label(t("bannerforge.duty.none"));
  else {
    form.label(
      raw(
        t("bannerforge.duty.intro", s.name),
        txt("\n§7"),
        t("bannerforge.duty.at_barracks", String(waiting)),
        ...(archers ? [txt("\n"), t("bannerforge.duty.on_towers", String(archers))] : []),
        ...(s.gates !== undefined && s.gates.length === 0 ? [txt("\n"), t("bannerforge.duty.no_gates")] : []),
      ),
    );
  }
  const hasGates = (s.gates?.length ?? 0) > 0;
  for (const task of TASKS) {
    if (task === "gate" && !hasGates) continue;
    if (!all.some((x) => x.post.id === "barracks")) break;
    const n = counts[task] ?? 0;
    form.button(raw(txt("+ "), roleName(task), txt(` (${n})`)), () => go(form, () => shift(player, s.id, task, 1, title)), {
      disabled: new ObservableBoolean(waiting <= 0),
    });
    form.button(raw(txt("- "), roleName(task)), () => go(form, () => shift(player, s.id, task, -1, title)), {
      disabled: new ObservableBoolean(n <= 0),
    });
  }
  // Training (the Captain trains; the town's tier caps the rank): the next soldier of each kind who can go up a rank.
  const max = garrisonRank(s);
  let capped = false;
  for (const kind of ["melee", "ranged"] as const) {
    const mine = all.filter((x) => x.post.kind === kind);
    if (!mine.length) continue;
    const next = mine.map((x) => ({ x, r: slotRank(s, x.key, max) })).sort((a, b) => a.r - b.r)[0];
    if (next.r >= max) {
      capped ||= max < 3;
      continue;
    }
    const to = (next.r + 1) as 2 | 3;
    const cost = [{ item: "minecraft:emerald", amount: TRAIN_COST[to] }];
    form.button(
      raw(t("bannerforge.duty.train"), txt(" "), txt(soldierTitle(kind, to)), txt(` (${TRAIN_COST[to]} `), t("bannerforge.currency.minecraft.emerald"), txt(")")),
      () => go(form, () => train(player, s.id, next.x.key, to, title)),
      { disabled: new ObservableBoolean(!canAfford(player, cost)) },
    );
  }
  if (capped) form.label(t("bannerforge.duty.train_later"));
  form.button(t("bannerforge.duty.close"), () => form.close());
  form.show().catch((err) => console.warn(`[BannerForge] duty board: ${err}`));
}

function shift(player: Player, id: string, task: Role, by: 1 | -1, title: string): void {
  const s = settlementById(id);
  if (!s) return;
  if (shiftTask(s, slots(s, (p) => postTag(s, p)), task, by)) {
    saveSettlement(s);
    maintain(s);
  }
  board(player, settlementById(id) ?? s, title);
}

/** Pays the Captain and gives the slot its new rank; the garrison pass re-equips the soldier (garrison.ts syncRank). */
function train(player: Player, id: string, key: string, rank: 2 | 3, title: string): void {
  const s = settlementById(id);
  if (!s || slotRank(s, key, garrisonRank(s)) >= rank) return;
  if (!pay(player, [{ item: "minecraft:emerald", amount: TRAIN_COST[rank] }])) return;
  setRank(s, key, rank);
  saveSettlement(s);
  maintain(s);
  const slot = slots(s, (p) => postTag(s, p)).find((x) => x.key === key);
  const e = slot && soldierOf(s, slot);
  if (slot) player.sendMessage(raw(txt("§a"), t("bannerforge.duty.trained", e ? shortName(e) : "—", soldierTitle(slot.post.kind, rank))));
  board(player, settlementById(id) ?? s, title);
}
