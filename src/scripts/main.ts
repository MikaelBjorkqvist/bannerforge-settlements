import { system } from "@minecraft/server";
import { registerBellSteward } from "./settlements/founding.js";
import { registerImageTest } from "./settlements/ui_images.js";

// Entry point. Keep this file small: register features from their own modules.
registerBellSteward();
registerImageTest();

system.run(() => {
  console.log("[BannerForge] Settlements loaded");
});
