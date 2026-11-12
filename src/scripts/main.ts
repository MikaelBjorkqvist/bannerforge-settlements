import { system } from "@minecraft/server";
import { registerStewardCharter } from "./settlements/steward_menu.js";

// Entry point. Keep this file small: register features from their own modules.
registerStewardCharter();

system.run(() => {
  console.log("[BannerForge] Settlements loaded");
});
