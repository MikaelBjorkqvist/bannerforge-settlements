import { system } from "@minecraft/server";
import { registerBanners } from "./settlements/banners.js";
import { registerCitizens } from "./settlements/citizens.js";
import { registerConstruction } from "./settlements/construction.js";
import { registerDevMenu } from "./settlements/dev.js";
import { registerGarrisons } from "./settlements/garrison.js";
import { registerPeople } from "./settlements/people.js";
import { registerPlacement } from "./settlements/placement.js";
import { registerSteward } from "./settlements/steward.js";
import { registerImageTest } from "./settlements/ui_images.js";

// Entry point. Keep this file small: register features from their own modules.
registerSteward();
registerConstruction();
registerGarrisons();
registerPlacement();
registerBanners();
registerImageTest();
registerDevMenu();
registerCitizens();
registerPeople();

system.run(() => {
  console.log("[BannerForge] Settlements loaded");
});
