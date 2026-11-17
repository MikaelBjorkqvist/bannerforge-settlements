// Promotion to Town or City is a milestone (owner, 2026-11-17: "fireworks or something"): a big title for everyone
// in and around the town, and a few seconds of fireworks over the bell in the faction's colour and gold.

import { MolangVariableMap, type RGB, system, world } from "@minecraft/server";
import { BORDER } from "./plots.js";
import { tier } from "./rules.js";
import { raw, t, txt } from "./text.js";
import type { Settlement } from "./types.js";

const FIREWORK = "bannerforge_settlements:firework";
const GOLD: RGB = { red: 1, green: 0.82, blue: 0.2 };
const FACTION_RGB: Record<string, RGB> = {
  green: { red: 0.25, green: 0.9, blue: 0.35 },
  blue: { red: 0.3, green: 0.5, blue: 1 },
  red: { red: 1, green: 0.25, blue: 0.2 },
};
/** Bursts, about half a second apart. */
const BURSTS = 10;

export function celebrate(s: Settlement): void {
  const dim = world.getDimension(s.dimension);
  const bell = { x: s.center.x + 0.5, y: s.center.y, z: s.center.z + 0.5 };
  const tierName = t(`bannerforge.tier.${tier(s)}`);
  const message = raw(t("bannerforge.tier.promoted", s.name), txt(" "), tierName, txt("!"));
  world.sendMessage(message);

  let players;
  try {
    players = dim.getPlayers({ location: bell, maxDistance: BORDER * 2 });
  } catch {
    players = [];
  }
  for (const p of players) {
    p.onScreenDisplay.setTitle(raw(txt("§6"), tierName, txt("!")), { subtitle: message, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
    p.playSound("random.levelup", { volume: 1 });
  }

  const colours = [FACTION_RGB[s.faction] ?? GOLD, GOLD];
  for (let i = 0; i < BURSTS; i++) {
    system.runTimeout(() => {
      const at = { x: bell.x + (Math.random() - 0.5) * 24, y: bell.y + 20 + Math.random() * 12, z: bell.z + (Math.random() - 0.5) * 24 };
      try {
        dim.playSound("firework.launch", { x: at.x, y: bell.y + 2, z: at.z }, { volume: 3 });
        system.runTimeout(() => {
          try {
            const vars = new MolangVariableMap();
            vars.setColorRGB("variable.color", colours[i % 2]);
            dim.spawnParticle(FIREWORK, at, vars);
            dim.playSound(i % 3 === 0 ? "firework.large_blast" : "firework.blast", at, { volume: 4 });
            system.runTimeout(() => dim.playSound("firework.twinkle", at, { volume: 3 }), 12);
          } catch {
            // unloaded chunk or the player left
          }
        }, 14);
      } catch {
        // unloaded chunk
      }
    }, 10 + i * 10);
  }
}
