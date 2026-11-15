import { world } from "@minecraft/server";

/**
 * In-game time in ticks: day number × 24000 + time of day. Unlike world.getAbsoluteTime(), this jumps forward
 * when players sleep through the night, so "one in-game day" really means one day on the in-game calendar
 * (play-test 2026-11-15: buildings must count nights that were slept through).
 */
export const gameTime = (): number => world.getDay() * 24000 + world.getTimeOfDay();
