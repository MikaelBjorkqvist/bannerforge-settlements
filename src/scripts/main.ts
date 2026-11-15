import { system } from "@minecraft/server";
import { registerSteward } from "./settlements/steward.js";
import { registerImageTest } from "./settlements/ui_images.js";

// Entry point. Keep this file small: register features from their own modules.
registerSteward();
registerImageTest();

system.run(() => {
  console.log("[BannerForge] Settlements loaded");
});
