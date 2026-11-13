import { system } from "@minecraft/server";
import { registerBellSteward } from "./settlements/founding.js";

// Entry point. Keep this file small: register features from their own modules.
registerBellSteward();

system.run(() => {
  console.log("[BannerForge] Settlements loaded");
});
