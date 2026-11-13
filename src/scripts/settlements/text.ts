// Text helpers: everything the player reads goes through lang keys (CLAUDE.md rule 5).
import type { Player, RawMessage } from "@minecraft/server";
import type { Cost } from "./buildings.js";
import type { Reason } from "./rules.js";

export const t = (key: string, ...args: string[]): RawMessage =>
  args.length ? { translate: key, with: args } : { translate: key };

export const raw = (...parts: RawMessage[]): RawMessage => ({ rawtext: parts });

export const txt = (text: string): RawMessage => ({ text });

export function say(player: Player, key: string, ...args: string[]): void {
  player.sendMessage(raw(t(key, ...args)));
}

/** "12 Emeralds" style text for a cost list. */
export function costText(costs: Cost[]): RawMessage {
  const parts: RawMessage[] = [];
  costs.forEach((c, i) => {
    if (i > 0) parts.push(txt(", "));
    parts.push(txt(`${c.amount} `), t(`bannerforge.currency.${c.item.replace(":", ".")}`));
  });
  return raw(...parts);
}

export function reasonText(r: Reason): RawMessage {
  const key = `bannerforge.rule.${r.key}`;
  if (!r.args.length) return { translate: key };
  return { translate: key, with: raw(...r.args.map((a, j) => (r.translateArgs?.includes(j) ? { translate: a } : txt(a)))) };
}

export const buildingName = (id: string) => t(`bannerforge.building.${id}`);
export const levelName = (level: number) => t(`bannerforge.level.${level}`);

/** Colour code per faction, used in headers and labels (not supported inside buttons). */
export const FACTION_COLOUR: Record<string, string> = { green: "§a", blue: "§9", red: "§c" };
