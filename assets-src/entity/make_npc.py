"""Original BannerForge NPC textures, drawn in layers like vanilla villagers (64x64, humanoid box layout of
geometry.bannerforge_settlements.npc). The game stacks four layers at runtime:

  1. skin_<n>.png        skin tone, face and hair            (picked per NPC: variety)
  2. outfit_<id>.png     clothes: neutral, then faction/biome (picked by settlement faction, later biome)
  3. prof_<id>.png       what the job adds on top            (steward, later smith, guard ...)
  4. rank_<n>.png        rank badge, empty for now

For now (owner, 2026-11-15: art is priority 2) the game uses flat placeholder textures: one per outfit, made by
stacking skin 1 + outfit + profession here. The layer PNGs are kept in assets-src/entity/layers/ for later.
Edit the tables and re-run; never edit PNGs by hand.
Usage: python3 make_npc.py <pack_texture_dir> <layer_dir> [preview.png]"""
import sys
from PIL import Image

CLEAR = (0, 0, 0, 0)

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

SKINS = [  # skin, shade, hair, eyes
    dict(skin='#d6a77f', shade='#b88660', hair='#c9a640', eye='#2b5a3a'),
    dict(skin='#c8956c', shade='#a8754f', hair='#5a3a1f', eye='#2b3a5a'),
    dict(skin='#9c6a45', shade='#7d5233', hair='#241a12', eye='#3a2a17'),
    dict(skin='#e0b896', shade='#c4977a', hair='#a0522d', eye='#3a5a7a'),
]

OUTFITS = {  # shirt, trim, trousers, boots
    'neutral': dict(shirt='#7d6b55', trim='#9c8a6e', legs='#4a4136', boots='#2e2418'),
    'green':   dict(shirt='#2f7a3a', trim='#e3c35a', legs='#4a5a2e', boots='#5a3a1f'),
    'blue':    dict(shirt='#2d5aa8', trim='#f2f2f2', legs='#2a2f3a', boots='#1e1e1f'),
    'red':     dict(shirt='#8f2a20', trim='#e3c35a', legs='#3a3b3c', boots='#2a2a2b'),
}

# box layouts (u, v, w, h, d) of the geometry
HEAD, HAT = (0, 0, 8, 8, 8), (32, 0, 8, 8, 8)
BODY = (16, 16, 8, 12, 4)
ARMS = [(40, 16, 4, 12, 4), (32, 48, 4, 12, 4)]
LEGS = [(0, 16, 4, 12, 4), (16, 48, 4, 12, 4)]

def faces(u, v, w, h, d):
    """(name, x0, y0, width, height) of the six faces of a box at (u, v)."""
    return [('top', u + d, v, w, d), ('bottom', u + d + w, v, w, d), ('right', u, v + d, d, h),
            ('front', u + d, v + d, w, h), ('left', u + d + w, v + d, d, h), ('back', u + 2 * d + w, v + d, w, h)]

def fill(px, x0, y0, w, h, col):
    for x in range(x0, x0 + w):
        for y in range(y0, y0 + h): px[x, y] = col

def box(px, b, col, only=None):
    for (name, x0, y0, w, h) in faces(*b):
        if only is None or name in only: fill(px, x0, y0, w, h, col)

def rows(px, b, y_from, y_to, col):
    """Paint rows y_from..y_to (0 = top of the side faces) around all four sides of a box."""
    u, v, w, h, d = b
    fill(px, u, v + d + y_from, 2 * (w + d), y_to - y_from, col)

def new():
    return Image.new('RGBA', (64, 64), CLEAR)

def paint_skin(s):
    img = new(); px = img.load(); C = {k: hexc(v) for k, v in s.items()}
    box(px, HEAD, C['skin'])
    box(px, BODY, C['skin'])
    for b in ARMS + LEGS: box(px, b, C['skin'])
    box(px, HEAD, C['hair'], only=('top', 'back'))
    rows(px, HEAD, 0, 3, C['hair'])                               # hair around the upper head
    fill(px, 8, 8, 8, 2, C['hair']); px[8, 10] = px[15, 10] = C['hair']   # fringe
    px[9, 12], px[10, 12], px[13, 12], px[14, 12] = hexc('#f2f2f2'), C['eye'], C['eye'], hexc('#f2f2f2')
    px[11, 13] = px[12, 13] = C['shade']                          # nose
    px[11, 14] = px[12, 14] = hexc('#7a4a33')                     # mouth
    return img

def paint_outfit(o):
    img = new(); px = img.load(); C = {k: hexc(v) for k, v in o.items()}
    box(px, BODY, C['shirt'])
    fill(px, 20, 20, 8, 1, C['trim'])                             # collar
    fill(px, 16, 27, 24, 1, hexc('#3a2a17'))                      # belt
    for b in ARMS:                                                # sleeves stop at the wrist
        u, v, w, h, d = b
        box(px, b, C['shirt'], only=('top',))
        rows(px, b, 0, 9, C['shirt']); rows(px, b, 9, 10, C['trim'])
    for b in LEGS:
        box(px, b, C['legs'], only=('top',))
        rows(px, b, 0, 9, C['legs']); rows(px, b, 9, 12, C['boots'])
        box(px, b, C['boots'], only=('bottom',))
    return img

def paint_steward():
    """Parchment tabard, gold chain of office, dark felt cap. Neutral colours so the faction outfit shows through."""
    img = new(); px = img.load()
    tab, edge, gold, cap, band = hexc('#d8c8a0'), hexc('#8a7350'), hexc('#e3c35a'), hexc('#3a2a17'), hexc('#6a4a2a')
    for x0 in (20, 32):                                           # tabard front (20..27) and back (32..39)
        fill(px, x0 + 1, 20, 6, 12, tab)
        fill(px, x0 + 1, 20, 1, 12, edge); fill(px, x0 + 6, 20, 1, 12, edge)
        fill(px, x0 + 1, 31, 6, 1, edge)
    fill(px, 22, 27, 4, 1, hexc('#3a2a17'))                       # belt crosses the tabard
    for (x, y) in [(21, 20), (22, 21), (23, 22), (24, 22), (25, 21), (26, 20)]: px[x, y] = gold
    px[23, 23] = px[24, 23] = gold; px[23, 24] = px[24, 24] = hexc('#b8902e')   # medallion
    box(px, HAT, cap, only=('top',))                               # cap: crown + band around the brim
    rows(px, HAT, 0, 2, cap); rows(px, HAT, 2, 3, band)
    return img

def preview(stack, path):
    """Front view of each composed NPC side by side, 8x scale."""
    S, W = 8, 16
    out = Image.new('RGBA', (len(stack) * (W + 4) * S, 34 * S), hexc('#48494a'))
    for i, layers in enumerate(stack):
        img = new()
        for layer in layers: img.alpha_composite(layer)
        ox = i * (W + 4) * S + 2 * S
        def blit(src, dst):
            region = img.crop(src).resize(((src[2] - src[0]) * S, (src[3] - src[1]) * S), Image.NEAREST)
            out.alpha_composite(region, (ox + dst[0] * S, dst[1] * S))
        blit((8, 8, 16, 16), (4, 1)); blit((40, 8, 48, 16), (4, 1))
        blit((20, 20, 28, 32), (4, 9))
        blit((44, 20, 48, 32), (0, 9)); blit((36, 52, 40, 64), (12, 9))
        blit((4, 20, 8, 32), (4, 21)); blit((20, 52, 24, 64), (8, 21))
    out.save(path)

if __name__ == '__main__':
    out, layers = sys.argv[1], sys.argv[2]
    skins = [paint_skin(s) for s in SKINS]
    outfits = {n: paint_outfit(o) for n, o in OUTFITS.items()}
    steward, rank0 = paint_steward(), new()
    for i, img in enumerate(skins): img.save(f'{layers}/skin_{i}.png')
    for n, img in outfits.items(): img.save(f'{layers}/outfit_{n}.png')
    steward.save(f'{layers}/prof_steward.png'); rank0.save(f'{layers}/rank_0.png')
    for n, img in outfits.items():                      # flat placeholders shipped in the pack
        flat = new(); flat.alpha_composite(skins[1]); flat.alpha_composite(img); flat.alpha_composite(steward)
        flat.save(f'{out}/steward_{n}.png')
    if len(sys.argv) > 3:
        preview([[skins[1], outfits[n], steward] for n in OUTFITS], sys.argv[3])
    print('ok')
