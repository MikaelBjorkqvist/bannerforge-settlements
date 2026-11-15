// Faction banners are two blocks (top with the emblem, bottom with the forked tail). A player places the top;
// the bottom is added below it. Breaking either part removes the other. Banner colours and patterns can't be set
// on vanilla banners from scripts, so the mod has its own banner blocks (owner, 2026-11-15).

import { BlockPermutation, type Block, world } from "@minecraft/server";

const BANNER = /^bannerforge_settlements:banner_(blue|green|red)$/;
const PART = "bannerforge_settlements:part";

export function registerBanners(): void {
  world.afterEvents.playerPlaceBlock.subscribe((e) => {
    const top = e.block;
    if (!BANNER.test(top.typeId) || top.permutation.getState(PART) !== "top") return;
    const below = top.below();
    if (!below?.isAir) return;
    const facing = top.permutation.getState("minecraft:cardinal_direction") as string;
    below.setPermutation(BlockPermutation.resolve(top.typeId, { [PART]: "bottom", "minecraft:cardinal_direction": facing }));
  });

  world.afterEvents.playerBreakBlock.subscribe((e) => {
    const old = e.brokenBlockPermutation;
    if (!BANNER.test(old.type.id)) return;
    const other: Block | undefined = old.getState(PART) === "top" ? e.block.below() : e.block.above();
    if (other?.typeId === old.type.id) other.setType("minecraft:air");
  });
}
