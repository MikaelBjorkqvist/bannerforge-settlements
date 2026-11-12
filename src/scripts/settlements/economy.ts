import type { Player } from "@minecraft/server";
import type { Cost } from "./buildings.js";

function inventoryOf(player: Player) {
  return player.getComponent("minecraft:inventory")?.container;
}

export function countItem(player: Player, typeId: string): number {
  const container = inventoryOf(player);
  if (!container) return 0;
  let total = 0;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (stack?.typeId === typeId) total += stack.amount;
  }
  return total;
}

export function canAfford(player: Player, costs: Cost[]): boolean {
  return costs.every((c) => countItem(player, c.item) >= c.amount);
}

/** Removes the cost from the player's inventory. Returns false (and takes nothing) if they can't afford it. */
export function pay(player: Player, costs: Cost[]): boolean {
  const container = inventoryOf(player);
  if (!container || !canAfford(player, costs)) return false;
  for (const cost of costs) {
    let remaining = cost.amount;
    for (let i = 0; i < container.size && remaining > 0; i++) {
      const stack = container.getItem(i);
      if (stack?.typeId !== cost.item) continue;
      if (stack.amount <= remaining) {
        remaining -= stack.amount;
        container.setItem(i, undefined);
      } else {
        stack.amount -= remaining;
        container.setItem(i, stack);
        remaining = 0;
      }
    }
  }
  return true;
}
