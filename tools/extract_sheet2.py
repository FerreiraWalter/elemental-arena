"""Extrai os 3 monstros novos (ouriço de fogo, polvo, louva-a-deus) de assets/source/monstros_novos.webp.
Folha: 2 linhas (estágio 1 e 3) x 3 colunas (fogo, água, planta). Gera assets/monsters/{hedgehog,octo,mantis}_{1,3}.png"""
from pathlib import Path
from PIL import Image
import extract_sprites as e

SRC = e.ROOT / 'assets' / 'source' / 'monstros_novos.webp'
NAMES = ['hedgehog', 'octo', 'mantis']
H = {'hedgehog': [34, 46], 'octo': [30, 50], 'mantis': [36, 56]}

def main():
    im = Image.open(SRC).convert('RGB')
    clean, bg = e.remove_background(im)
    groups = e.find_sprites(clean, nrows=2, ncols=3)
    prev = []
    for stage, row in enumerate(groups):
        for col, box in enumerate(row):
            name = NAMES[col]
            spr = clean.crop(box)
            small = e.outline(e.quantize(e.downscale(spr, H[name][stage] - 2), 28))
            out = f'{name}_{1 if stage == 0 else 3}.png'
            small.save(e.OUT / out)
            prev.append(small)
            print(out, small.size)
    sc = 4
    W = sum(s.size[0] for s in prev) * sc + 140
    sheet = Image.new('RGBA', (W, 70 * sc), (43, 47, 96, 255))
    x = 10
    for s in prev:
        big = s.resize((s.size[0] * sc, s.size[1] * sc), Image.NEAREST)
        sheet.alpha_composite(big, (x, 70 * sc - big.size[1] - 8)); x += big.size[0] + 20
    sheet.save(e.OUT / 'preview2.png')

main()
