"""Monta sprites de pixel art desenhados à mão (tools/pixelart/*.txt) com a paleta abaixo.
Uso: python tools/pixelart/build.py   (gera assets/monsters/<nome>.png)"""
from pathlib import Path
from PIL import Image
HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'assets' / 'monsters'
PAL = {
    'K': '#0e1426', 'H': '#f2cc5e', 'h': '#c9973a', 'd': '#7a5222', 'y': '#fff0a0',
    'C': '#f1e6cc', 'c': '#cbbb9c', 'B': '#4b3a35', 'b': '#2c221f',
    'E': '#6fe6ff', 'e': '#e2ffff', 'P': '#e48a9c',
    'V': '#3566c8', 'v': '#1f3a78', 'W': '#e9eef7', 'w': '#aab6cc',
    'L': '#a8f2ff', 'l': '#3fa9ff', 'G': '#6b7a8e', 'g': '#3c4656',
    'R': '#ffe24a', 'M': '#4fae3e', 'm': '#2f7a2c', 'n': '#9be862', 'T': '#7a4a28', 't': '#4e2e1a', 'O': '#9a9584', 'o': '#625f54', 'F': '#ff6fae', 'f': '#ffc4de', 'Z': '#d8ff6a', 'S': '#c8d3e4', 's': '#8e9ab2', 'N': '#26304a',
}
MAP = {'raiolua': 'cat_1', 'trovogato': 'cat_3', 'brotossauro': 'plant_1'}
for f in HERE.glob('*.txt'):
    rows = [r for r in f.read_text().splitlines() if r.strip()]
    w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w, len(rows)))
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in PAL:
                c = PAL[ch].lstrip('#')
                px[x, y] = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
    name = MAP.get(f.stem, f.stem)
    im.save(OUT / f'{name}.png')
    print(name, im.size)
