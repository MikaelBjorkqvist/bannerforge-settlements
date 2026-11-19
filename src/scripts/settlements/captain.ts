// The Captain's duty board (owner 2026-11-19: the Captain and the player choose duties). Talking to the Captain lists
// every soldier slot with its duty; picking one offers the duties that soldier can take, or the Captain's own choice.
// The garrison pass then walks the soldier to his new spot (garrison.ts reassign).

import { type Entity, type Player, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean } from "@minecraft/server-ui";
import { defaultRole, rolesFor, setDuty, setRank, slotRank, slots, TRAIN_COST, type Slot } from "./duties.js";
import { canAfford, pay } from "./economy.js";
import { garrisonRank } from "./rules.js";
import { captainTag, maintain, P_DUTY, postTag } from "./garrison.js";
import { allSettlements, saveSettlement, settlementById } from "./registry.js";
import { SOLDIER_ID, soldierTitle } from "./soldier.js";
import { buildingName, raw, t, txt } from "./text.js";
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

function board(player: Player, s: Settlement, title: string): void {
  const all = slots(s, (p) => postTag(s, p));
  const form = new CustomForm(player, raw(txt(title)));
  form.label(raw(t("bannerforge.duty.intro", s.name)));
  if (!all.length) form.label(t("bannerforge.duty.none"));
  for (const slot of all) {
    const e = soldierOf(s, slot);
    const who = e ? txt(shortName(e)) : t("bannerforge.duty.vacant");
    form.button(raw(who, txt(": "), roleName(slot.role)), () => go(form, () => choose(player, s.id, slot.key, title)));
  }
  form.button(t("bannerforge.duty.close"), () => form.close());
  form.show().catch((err) => console.warn(`[BannerForge] duty board: ${err}`));
}

function choose(player: Player, id: string, key: string, title: string): void {
  const s = settlementById(id);
  if (!s) return;
  const slot = slots(s, (p) => postTag(s, p)).find((x) => x.key === key);
  if (!slot) return;
  const e = soldierOf(s, slot);
  const own = defaultRole(slot.post, slot.n, (s.gates?.length ?? 0) > 0);
  const form = new CustomForm(player, raw(e ? txt(e.nameTag) : t("bannerforge.duty.vacant")));
  form.label(raw(t("bannerforge.duty.from"), txt(" "), buildingName(slot.post.id), txt("\n"), t("bannerforge.duty.now"), txt(" "), roleName(slot.role)));
  if (s.gates !== undefined && s.gates.length === 0) form.label(t("bannerforge.duty.no_gates"));
  // Training (owner 2026-11-19: the Captain trains; the town's tier caps the rank).
  const max = garrisonRank(s);
  const rank = slotRank(s, key, max);
  if (rank < max) {
    const next = (rank + 1) as 2 | 3;
    const cost = [{ item: "minecraft:emerald", amount: TRAIN_COST[next] }];
    form.button(raw(t("bannerforge.duty.train"), txt(" "), txt(soldierTitle(slot.post.kind, next)), txt(` (${TRAIN_COST[next]} `), t("bannerforge.currency.minecraft.emerald"), txt(")")), () => go(form, () => train(player, id, key, next, title)), {
      disabled: new ObservableBoolean(!canAfford(player, cost)),
    });
  } else if (rank < 3) {
    form.label(t("bannerforge.duty.train_later"));
  }
  for (const role of rolesFor(slot.post)) {
    if (role === "gate" && !(s.gates?.length)) continue;
    form.button(roleName(role), () => go(form, () => apply(player, id, key, role === own ? undefined : role, title)));
  }
  form.button(raw(t("bannerforge.duty.captains_choice"), txt(" ("), roleName(own), txt(")")), () => go(form, () => apply(player, id, key, undefined, title)));
  form.button(t("bannerforge.duty.back"), () => go(form, () => board(player, s, title)));
  form.show().catch((err) => console.warn(`[BannerForge] duty: ${err}`));
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
  if (e) player.sendMessage(raw(txt("§a"), t("bannerforge.duty.trained", shortName(e), soldierTitle(slot!.post.kind, rank))));
  choose(player, id, key, title);
}

function apply(player: Player, id: string, key: string, role: Role | undefined, title: string): void {
  const s = settlementById(id);
  if (!s) return;
  setDuty(s, key, role);
  saveSettlement(s);
  maintain(s);
  const fresh = settlementById(id) ?? s;
  board(player, fresh, title);
}
