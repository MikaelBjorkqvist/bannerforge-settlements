# Asset register

Every shipped asset (texture, model, animation, sound, structure, icon) must be listed here before release.
Marketplace review requires original or properly licensed content; this file is the proof.

| File (in packs/) | Source file (assets-src/) | Author | Method | Licence / rights | Added |
| --- | --- | --- | --- | --- | --- |
| BP/pack_icon.png, RP/pack_icon.png | pack_icon.svg | Claude (for BannerForge) | Hand-written 32×32 pixel SVG, rendered with sharp | Original, owned by BannerForge | 2026-11-12 |
| RP/textures/bannerforge/settlements/ui/*.png (22 icons, 3 faction banners) | ui/make_ui_icons.py (character maps) → ui/svg/*.svg | Claude (for BannerForge) | Hand-made 8×8 / 8×12 pixel maps, rendered to 64 px PNG with sharp (nearest) | Original, owned by BannerForge | 2026-11-13 |
| RP/textures/bannerforge/settlements/entity/npc/steward_*.png (4 placeholder outfits; layer sources in assets-src/entity/layers/) | entity/make_npc.py (layer tables) | Claude (for BannerForge) | Pixel layers painted by script on our own 64×64 box layout | Original, owned by BannerForge | 2026-11-15 |
| RP/models/entity/npc.geo.json | written by hand | Claude (for BannerForge) | Plain humanoid boxes (head, hat, body, arms, legs) | Original, owned by BannerForge | 2026-11-15 |
| RP/animations/npc.animation.json | written by hand | Claude (for BannerForge) | Walk swing and head look, Molang | Original, owned by BannerForge | 2026-11-15 |
| RP/textures/bannerforge/settlements/particle/marker.png, RP/particles/marker.particle.json | drawn by a one-line PIL script (soft 8×8 dot) | Claude (for BannerForge) | Tinted per use (plot outlines, town border) | Original, owned by BannerForge | 2026-11-15 |
| RP/textures/bannerforge/settlements/items/building_plan.png | items/building_plan.txt (16×16 pixel map) | Claude (for BannerForge) | Hand-made pixel map | Original, owned by BannerForge | 2026-11-15 |
| BP structures via src/scripts/settlements/generated/blueprints.ts (Kingscross house A, levels 1-3, draft) | structures/kingscross/house.py (toolkit bfstruct.py) | Claude (for BannerForge) | Generated from palette and rules; owner concept art as direction only (assets-src/references, not shipped) | Original, owned by BannerForge | 2026-11-15 |
| RP/textures/bannerforge/settlements/blocks/banner_{blue,green,red}_{top,bottom}.png, RP/models/blocks/wall_banner.geo.json | blocks/make_banners.py (16×16 pixel maps) | Claude (for BannerForge) | Hand-made pixel maps, same emblems as the ledger UI banners; hand-written thin-plane geometry | Original, owned by BannerForge | 2026-11-15 |
