"""Original BannerForge UI pixel art. Each icon is a character map; run this to regenerate the SVGs,
then render them to PNG (see docs/ASSETS.md). Edit the maps here, never the PNGs."""
import os
PAL = {
 'k': '#1e1e1f', 'w': '#8a6a3f', 'W': '#5a3a1f', 'r': '#b8402e', 'R': '#8f2a20', 'y': '#e3c35a', 'Y': '#c9a640',
 's': '#9a9ca0', 'S': '#6a6b6e', 'g': '#3fbf5f', 'G': '#7ef09a', 'b': '#2d5aa8', 'B': '#9cc3ff', 'p': '#f2d0a8',
 'c': '#e8dcc0', 'v': '#b05ad8', 'l': '#2f7a3a', 'f': '#f2f2f2', 'h': '#5a7ac0', 'n': '#d07040',
}
ICONS = {
 # sections
 'section_centre': ["...yy...", "..rrrr..", ".rrrrrr.", "rrrrrrrr", ".cccccc.", ".cWccWc.", ".cccWWc.", ".ssssss."],
 'section_population': [".pp..pp.", ".pp..pp.", "hhhhnnnn", "hhhhnnnn", ".hh..nn.", ".hh..nn.", ".h.h.n.n", ".h.h.n.n"],
 'section_trade': ["...gg...", "..gGGg..", ".gGfGGg.", "gGGGGGGg", "gGGGGGgg", ".gGGGgg.", "..gggg..", "...gg..."],
 'section_food': ["..y.y.y.", ".yYyYyY.", "..YyYyY.", "...YYY..", "...lYl..", "...lYl..", "....Y...", "....Y..."],
 'section_defence': ["ssssssss", "sbbbbbbs", "sbbyybbs", "sbyyyybs", "sbbyybbs", ".sbbbbs.", "..sbbs..", "...ss..."],
 # buildings
 'town_hall': ["...yy...", "..rrrr..", ".rrrrrr.", "rrrrrrrr", ".cccccc.", ".cWccWc.", ".cccWWc.", ".ssssss."],
 'keep': ["s.s..s.s", "ssssssss", ".sSssSs.", ".ssssss.", ".sSssSs.", ".ssWWss.", ".ssWWss.", "ssssssss"],
 'shrine': ["...yy...", "..yffy..", "...ff...", "..ssss..", ".sffffs.", ".sfyyfs.", ".sffffs.", "ssssssss"],
 'warehouse': ["........", ".wwwwww.", "wWwWwWww", "wwwwwwww", "wWWwwWWw", "wWWwwWWw", "wwwwwwww", "........"],
 'house': ["...rr...", "..rrrr..", ".rrrrrr.", "rrrrrrrr", ".cwccwc.", ".cBccBc.", ".ccWWcc.", ".ccWWcc."],
 'market': ["rfrfrfrf", "rfrfrfrf", ".w....w.", ".w.yg.w.", ".wwwwww.", ".wWWWWw.", ".w....w.", ".w....w."],
 'tavern': ["..fff...", ".ffffff.", ".yyyyy..", ".yYyyyww", ".yyyyy.w", ".yyYyyww", ".yyyyy..", "..YYY..."],
 'stables': [".....W..", "....WWW.", "...WWWWw", "..WWWkWW", ".WWWWWWW", "WWW.WWW.", "WW..WW..", "W...W..."],
 'blacksmith': ["........", "kSSSSSS.", ".SSSSSSk", "...SS...", "...SS...", "..SSSS..", ".SSSSSS.", "........"],
 'fletcher': ["..w....f", ".w....f.", "w....s..", "w...s...", "w..s....", "w.f.....", ".wf.....", "..w....."],
 'alchemist': ["...ww...", "...ff...", "..f..f..", ".fvvvvf.", "fvvGvvvf", "fvvvvvvf", ".fvvvvf.", "..ffff.."],
 'stonemason': ["........", "ssssSsss", "SSSSSSSS", "ssSsssSs", "SSSSSSSS", "ssssSsss", "SSSSSSSS", "........"],
 'woodcarver': [".ss.....", "sssw....", ".ssw....", "...w....", "...w....", "wwwwwwww", "wnwwwnww", "wwwwwwww"],
 'farmstead': ["..y.y.y.", "..l.l.l.", "WWWWWWWW", ".y.y.y.y", ".l.l.l.l", "WWWWWWWW", "..y.y.y.", "WWWWWWWW"],
 'docks': ["...f....", "...ff...", "...fff..", "...w....", "wwwwwwww", ".wWWWWw.", "bbbbbbbb", "BbBbBbBb"],
 'defences': ["s.s..s.s", "sss..sss", "sSs..sSs", "ssssssss", "sSsssSss", "sssWWsss", "sSsWWsSs", "ssssssss"],
 'barracks': ["f......f", ".f....f.", "..f..f..", "...ff...", "...ff...", "..y..y..", ".W....W.", "W......W"],
 # faction banners (8 x 12)
 'banner_blue': ["wwwwwwww", ".bbbbbb.", ".bbyybb.", ".byyyyb.", ".bbyybb.", ".bbyybb.", ".bbyybb.", ".bbbbbb.", ".bbbbbb.", ".bb..bb.", ".b....b.", "........"],
 'banner_green': ["wwwwwwww", ".llllll.", ".llGGll.", ".lGGGGl.", ".lGGGGl.", ".llGGll.", ".lllyll.", ".llllll.", ".llllll.", ".ll..ll.", ".l....l.", "........"],
 'banner_red': ["wwwwwwww", ".rrrrrr.", ".ryyyyr.", ".ryyyyr.", ".rrYYrr.", ".rrYYrr.", ".rrYYrr.", ".rrrrrr.", ".rrrrrr.", ".rr..rr.", ".r....r.", "........"],
}
out = os.path.join(os.path.dirname(__file__), 'svg')
os.makedirs(out, exist_ok=True)
for name, rows in ICONS.items():
    w, h = len(rows[0]), len(rows)
    assert all(len(r) == w for r in rows), name
    rects = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{PAL[c]}"/>'
                    for y, r in enumerate(rows) for x, c in enumerate(r) if c != '.')
    with open(os.path.join(out, name + '.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" shape-rendering="crispEdges">{rects}</svg>')
print(len(ICONS), 'svgs')
