"""Extrai os sprites do Arutchin (base) e do Anemokahn (evolução) da arte do usuário (assets/source/genio.webp).

A arte veio com o xadrez de "transparência" pintado no fundo (cinza neutro 128/180). O gênio e o redemoinho dele são
levemente azulados, então o fundo é o que é cinza NEUTRO perto desses dois tons; o resto (corpo, cabelo, ouro, vento)
fica. Limpa fiapos, pega o maior pedaço e tapa buracos pequenos; depois o mesmo pipeline dos outros monstros:
redução por blocos sem misturar cores, paleta curta e contorno de 1 px. Os olhos acesos são recarimbados no fim.

Uso: python tools/extract_genio.py [pasta-de-depuração]   (gera assets/monsters/djinn_1.png e djinn_3.png)
"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from extract_sprites import outline  # noqa: E402
from extract_frogs import snap  # noqa: E402
from extract_forja import crisp  # noqa: E402

SRC = ROOT / 'assets' / 'source' / 'genio.webp'
OUT = ROOT / 'assets' / 'monsters'


def cut(rgb, box):
    x0, y0, x1, y1 = box
    sub = rgb[y0:y1, x0:x1].astype(np.int32)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    neutral = (np.abs(r - g) <= 6) & (np.abs(g - b) <= 6)
    v = (r + g + b) / 3
    checker = neutral & ((np.abs(v - 129) < 14) | (np.abs(v - 180) < 14))
    # Quadrados do xadrez em tons mais claros/escuros: cinza neutro e LISO (o vento tem traço e textura).
    vv = v.astype(np.float32)
    std = np.sqrt(np.maximum(0, cv2.blur(vv * vv, (5, 5)) - cv2.blur(vv, (5, 5)) ** 2))
    checker |= neutral & (vv > 110) & (vv < 215) & (std < 3.5)
    mask = (~checker * 255).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3, iterations=2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    keep = np.zeros_like(mask)
    # O maior pedaço (o gênio) e os redemoinhos soltos grandes em volta dele.
    for k in range(1, n):
        if k == big or st[k, cv2.CC_STAT_AREA] > st[big, cv2.CC_STAT_AREA] * 0.02:
            keep[lab == k] = 255
    inv = cv2.bitwise_not(keep)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for k in range(1, n):
        bx, by, bw, bh, area = st[k]
        if bx > 0 and by > 0 and bx + bw < keep.shape[1] and by + bh < keep.shape[0] and area < 900:
            keep[lab == k] = 255
    rgba = np.dstack([rgb[y0:y1, x0:x1], keep]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im.crop(im.getbbox())


def eyes(spr, small_shape, bbox, col):
    """Centros dos olhos acesos (ciano claro) na arte, na escala do sprite final."""
    full = np.asarray(spr).astype(np.int32)
    r, g, b, al = full[..., 0], full[..., 1], full[..., 2], full[..., 3]
    lit = ((al > 0) & (g > 190) & (b > 190) & (r < 200)).astype(np.uint8)
    lit[int(full.shape[0] * 0.45):] = 0
    n, lab, st, cen = cv2.connectedComponentsWithStats(cv2.dilate(lit, np.ones((5, 5), np.uint8)))
    sx, sy = small_shape[1] / spr.width, small_shape[0] / spr.height
    out = []
    for k in sorted(range(1, n), key=lambda k: -st[k, cv2.CC_STAT_AREA])[:2]:
        if st[k, cv2.CC_STAT_AREA] >= 8:
            out.append((int(cen[k][0] * sx) - bbox[0] + 1, int(cen[k][1] * sy) - bbox[1] + 1))
    return out


def main(debug=None):
    rgb = np.asarray(Image.open(SRC).convert('RGB'))
    base = cut(rgb, (80, 190, 430, 540))
    evo = cut(rgb, (515, 170, 1005, 545))
    if debug:
        for im, name in ((base, 'g1_cut'), (evo, 'g3_cut')):
            bgc = Image.new('RGBA', im.size, (255, 0, 255, 255)); bgc.alpha_composite(im)
            bgc.save(Path(debug) / f'{name}.png')
    for spr, name, h in ((base, 'djinn_1', 40), (evo, 'djinn_3', 62)):
        small = crisp(spr, h - 2)
        # A pele é um azul-ardósia apagado: na arena clara lia como prata. Mais cor e contraste (o alfa não muda).
        al = small.getchannel('A')
        small = ImageEnhance.Contrast(ImageEnhance.Color(small.convert('RGB')).enhance(1.6)).enhance(1.15).convert('RGBA')
        small.putalpha(al)
        a = np.asarray(small).astype(np.int32)
        n, lab, st, _ = cv2.connectedComponentsWithStats((a[..., 3] > 0).astype(np.uint8), connectivity=8)
        for k in range(1, n):
            if st[k, cv2.CC_STAT_AREA] < 4:
                a[lab == k] = 0  # pontinhos soltos do vento
        small = snap(Image.fromarray(a.astype(np.uint8), 'RGBA'), 28)
        bbox = small.getbbox()
        o = np.asarray(outline(small.crop(bbox))).copy()
        for ex, ey in eyes(spr, a.shape, bbox, None):
            for dx in (0, 1):
                if 0 <= ex + dx < o.shape[1] and 0 <= ey < o.shape[0] and o[ey, ex + dx, 3]:
                    o[ey, ex + dx] = (170, 255, 250, 255)
        Image.fromarray(o, 'RGBA').save(OUT / f'{name}.png')
        print(name, o.shape[1], o.shape[0])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
