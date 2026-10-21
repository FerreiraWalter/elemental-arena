"""Recorta as araras voadoras (Araralvo e Araravento) da arte de referência e gera os sprites.
Fundo cinza uniforme. As espirais de vento (ciano pálido) e penas soltas viram efeitos do jogo, não parte do sprite:
a máscara pega só pixels saturados/escuros do pássaro e fica com o pedaço CONECTADO ao corpo.
Uso: python tools/extract_araras.py [assets/source/araras.webp]   (gera assets/monsters/bird_1.png e bird_3.png)"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sprites import downscale, outline  # noqa: E402
from extract_frogs import snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'monsters'
# nome, caixa (x0, y0, x1, y1), ponto no corpo, altura final (px)
JOBS = [
    ('bird_1', (30, 135, 300, 445), (215, 300), 40),
    ('bird_3', (375, 20, 845, 560), (560, 260), 62),
]


def cut(img, box, seed):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    bg = np.array([60, 66, 70], np.float32)
    far = np.abs(sub - bg).sum(-1) > 48
    sat = sub.max(-1) - sub.min(-1)
    lum = sub @ np.array([0.3, 0.59, 0.11])
    swirl = (b > r + 40) & (g > r + 25) & (lum > 130) & (sat > 35) & (sat < 150)  # vento ciano (o bico cinza fica)
    mask = ((far & ~swirl) * 255).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=1)
    _, lab = cv2.connectedComponents(mask)
    keep = (lab == lab[seed[1] - y0, seed[0] - x0]).astype(np.uint8) * 255
    ff = keep.copy(); h, w = ff.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    holes = cv2.bitwise_not(ff)
    keep = keep | (holes & (far * 255).astype(np.uint8))  # tapa buracos internos que não são fundo
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, k3, iterations=1) > 0
    rgba = np.dstack([sub, keep * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im.crop(im.getbbox())


def fix_beak(spr):
    """O bico claro do Araravento sai esverdeado na paleta curta: volta para marfim, com linha e olho amarelo.
    Fora da cabeça, o mesmo verde-claro é resto de vento e vira azul de pena."""
    px = spr.load()
    W, H = spr.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if not a: continue
            pale = g >= r and g > b + 20 and g > 120
            mid = abs(r - 0x58) < 12 and abs(g - 0x6c) < 12 and abs(b - 0x5a) < 12
            head = 15 <= x <= 21 and 26 <= y <= 32
            if pale: px[x, y] = ((0xe6, 0xdd, 0xcc, 255) if y < 30 else (0xb8, 0xad, 0x9c, 255)) if head else (0x2a, 0x6a, 0xd8, 255)
            elif mid and head: px[x, y] = (0x6a, 0x62, 0x5a, 255)
            elif head and 18 <= x <= 19 and 29 <= y <= 31 and r < 70 and b > r: px[x, y] = (0x3a, 0x32, 0x30, 255)
    px[20, 26] = (0xf8, 0xd0, 0x40, 255); px[21, 26] = (0x14, 0x10, 0x0e, 255)


def main():
    src = Image.open(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'assets' / 'source' / 'araras.webp')
    for name, box, seed, h in JOBS:
        spr = downscale(cut(src, box, seed), h - 2)
        # A média por área desbota as cores: devolve a saturação das penas (vermelho, azul, verde).
        rgb = ImageEnhance.Color(spr.convert('RGB')).enhance(1.3)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.1)
        spr = Image.merge('RGBA', (*rgb.split(), spr.getchannel('A')))
        # Pontinhos soltos (penas finas que a redução separou do corpo) saem.
        al = (np.asarray(spr.getchannel('A')) > 0).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(al, connectivity=8)
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        spr.putalpha(Image.fromarray(((lab == big) * 255).astype(np.uint8)))
        spr = outline(snap(spr, 32))
        if name == 'bird_3': fix_beak(spr)
        spr.save(OUT / f'{name}.png')
        print(name, spr.size)


if __name__ == '__main__':
    main()
