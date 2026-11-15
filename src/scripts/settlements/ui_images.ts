// UI images (DDUI image rows and button icons) name the resource pack that holds them. The docs only say
// "resource pack identifier". Confirmed in-game on 26.60 (owner, 2026-11-15) with the image test: the pack is the
// resource pack's header UUID and the image path must include ".png" (variant B). The test stays available as a
// developer tool (/scriptevent bannerforge:imagetest) in case a future Minecraft version changes this.
import { type Player, system, world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";

// Replaced at build time (tools/build.mjs).
const RP = "__RP_PACK_ID__";
const BP = "__BP_PACK_ID__";
const VERSION = "__PACK_VERSION__";

interface Variant {
  label: string;
  pack: string;
  ext: string;
}
const VARIANTS: Record<string, Variant> = {
  uuid: { label: "A: resource pack UUID", pack: RP, ext: "" },
  uuid_png: { label: "B: resource pack UUID + .png", pack: RP, ext: ".png" },
  uuid_version: { label: "C: UUID_version", pack: `${RP}_${VERSION}`, ext: "" },
  bp_uuid: { label: "D: behavior pack UUID", pack: BP, ext: "" },
  name: { label: "E: name 'bannerforge'", pack: "bannerforge", ext: "" },
};
const PROPERTY = "bannerforge:ui_image_variant";
const UI = "textures/bannerforge/ui/";

function variant(): Variant {
  const key = world.getDynamicProperty(PROPERTY);
  return (typeof key === "string" && VARIANTS[key]) || VARIANTS.uuid_png;
}

/** Image path + pack for an icon in textures/bannerforge/ui/. */
export function uiImage(name: string): { src: string; pack: string } {
  const v = variant();
  return { src: UI + name + v.ext, pack: v.pack };
}

/** Button icon details for an icon in textures/bannerforge/ui/. */
export function uiIcon(name: string): { imagePackId: string; imageSrc: string } {
  const { src, pack } = uiImage(name);
  return { imagePackId: pack, imageSrc: src };
}

/** Developer tool: shows the banner with every candidate pack identifier; "Use this" stores the one that renders. */
export function registerImageTest(): void {
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "bannerforge:imagetest") return;
    const player = event.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    showImageTest(player as Player);
  });
}

function showImageTest(player: Player): void {
  const form = new CustomForm(player, "Image test");
  form.label("Which banners do you see? Press 'Use' under one that shows.");
  form.header("Vanilla check (should always show)");
  form.image("textures/ui/World", "core", { width: 0.15 });
  for (const [key, v] of Object.entries(VARIANTS)) {
    form.divider();
    form.header(v.label);
    form.image(UI + "banner_blue" + v.ext, v.pack, { width: 0.15 });
    form.button(`Use ${v.label.slice(0, 1)}`, () => {
      world.setDynamicProperty(PROPERTY, key);
      player.sendMessage(`[BannerForge] UI images now use variant ${v.label}`);
      form.close();
    }, { imageDetails: { imagePackId: v.pack, imageSrc: UI + "house" + v.ext } });
  }
  form.closeButton();
  form.show().catch((e) => console.warn(`[BannerForge] image test: ${e}`));
}
