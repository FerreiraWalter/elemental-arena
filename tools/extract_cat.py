"""Extrai os sprites do Raiolua e do Trovogato da arte de referência do usuário (docs/ref/raiolua-trovogato.png).

A arte tem fundo de floresta escura e auras de raio, então o recorte é feito com GrabCut (OpenCV) a partir de
retângulos ajustados à mão, e depois limpo por zonas (faíscas soltas, espiral e aura). Em seguida usa o mesmo
pipeline dos outros monstros: redução por área, paleta limitada e contorno de 1 px.

Uso: python tools/extract_cat.py   (gera assets/monsters/cat_1.png e cat_3.png)
"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from extract_sprites import downscale, quantize, outline  # noqa: E402

SRC = ROOT / 'docs' / 'ref' / 'raiolua-trovogato.png'
OUT = ROOT / 'assets' / 'monsters'


def grab(img, rect, bg_rects=(), it=10):
    x, y, w, h = rect
    mask = np.zeros(img.shape[:2], np.uint8)
    mask[y:y + h, x:x + w] = cv2.GC_PR_FGD
    for (a, b, c, d) in bg_rects:
        mask[y + b:y + d, x + a:x + c] = cv2.GC_BGD
    bgm = np.zeros((1, 65), np.float64); fgm = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgm, fgm, it, cv2.GC_INIT_WITH_MASK)
    m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)[y:y + h, x:x + w]
    return m


def finish(img, rect, m, erase=()):
    x, y, w, h = rect
    for (a, b, c, d) in erase:
        m[b:d, a:c] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    m = np.where(lab == big, 255, 0).astype(np.uint8)
    # Preenche buracos internos (olhos brilhantes viram "fundo" no GrabCut).
    inv = cv2.bitwise_not(m)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for k in range(1, n):
        bx, by, bw, bh, area = st[k]
        if bx > 0 and by > 0 and bx + bw < w and by + bh < h and area < 400:
            m[lab == k] = 255
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)[y:y + h, x:x + w].copy()
    rgba[:, :, 3] = m
    ys, xs = np.nonzero(m)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(rgba, 'RGBA')


def main():
    img = cv2.imread(str(SRC))
    # Raiolua: gato pequeno de chapéu; tira as faíscas à esquerda e a espiral de raio embaixo/à direita.
    r1 = (100, 568, 180, 205)
    m1 = grab(img, r1, [(0, 0, 14, 205)])
    rai = finish(img, r1, m1, erase=[(0, 0, 24, 205), (130, 100, 180, 205), (100, 170, 180, 205), (0, 185, 180, 205)])
    # Trovogato: humanoide de túnica; tira a aura de raios acima do ombro direito.
    r3 = (420, 370, 300, 540)
    m3 = grab(img, r3, [(212, 0, 300, 320), (0, 60, 12, 170), (0, 0, 300, 8), (240, 320, 300, 350)])
    tro = finish(img, r3, m3, erase=[(170, 0, 300, 150)])
    rai.save('/tmp/rai_full.png'); tro.save('/tmp/tro_full.png')
    for spr, name, h in ((rai, 'cat_1', 32), (tro, 'cat_3', 58)):
        small = outline(quantize(downscale(spr, h - 2), 26))
        small.save(OUT / f'{name}.png')
        print(name, small.size)


if __name__ == '__main__':
    main()
