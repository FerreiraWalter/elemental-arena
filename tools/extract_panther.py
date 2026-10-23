"""Extrai os sprites da Pantrinja (base) e da Kagepantera (evolução) da arte do usuário (assets/source/pantera.png).

A arte tem fundo marrom quase preto e uma aura de fumaça roxa em volta das panteras. O recorte começa por cor
(corpo azul-arroxeado e armadura têm verde perto do vermelho; lenço vermelho, olhos e garras claros), descarta a
fumaça e a aura (roxas, com pouco verde); fica o maior pedaço, com os buracos internos tapados. Depois vem o mesmo pipeline dos
outros monstros: redução por blocos sem misturar cores, paleta curta e contorno de 1 px.

Uso: python tools/extract_panther.py   (gera assets/monsters/panther_1.png e panther_3.png)
"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from extract_sprites import outline  # noqa: E402
from extract_frogs import snap  # noqa: E402
from extract_forja import crisp  # noqa: E402

SRC = ROOT / 'assets' / 'source' / 'pantera.png'
OUT = ROOT / 'assets' / 'monsters'


def body_mask(rgb, box, close=2, ground_rows=0):
    x0, y0, x1, y1 = box
    sub = rgb[y0:y1, x0:x1].astype(np.int32)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    bg = np.array([21, 16, 12])
    far = np.abs(sub - bg).sum(-1) > 34
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    # Corpo, armadura e garras têm verde perto do vermelho; a fumaça e a aura roxa têm bem menos verde.
    solid = (r - g) < 10
    red = (r > 70) & (r > g + 35) & (b < r + 5)  # lenço e faixa, inclusive a ponta mais escura
    bright = (lum > 115) & ((r - g) < 60)  # olhos, garras, brilhos do metal
    mask = ((far & (solid | red | bright)) * 255).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=close)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3, iterations=1)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    mask = np.where(lab == big, 255, 0).astype(np.uint8)
    ff = mask.copy(); h, w = ff.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    mask |= cv2.bitwise_not(ff)
    # Vãos entre braços e pernas: o fundo aparece com a cor dele (marrom); o corpo escuro é azulado. E o chão roxo
    # embaixo dos pés (quase sem verde) nas últimas linhas.
    gap = np.abs(sub - bg).sum(-1) < 24
    ground = (g < 9) & (np.arange(h)[:, None] > h - ground_rows)
    mask[gap | ground] = 0
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3, iterations=1)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    mask = np.where(lab == big, 255, 0).astype(np.uint8)
    rgba = np.dstack([rgb[y0:y1, x0:x1], mask]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im.crop(im.getbbox())

# Kagepantera: a aura roxa deixava pedaços soltos nas garras (espinho em cima da lâmina esquerda, fiapos e um pedaço
# do rabo à direita, riscos do chão entre os pés). Apaga esses retângulos (coordenadas no sprite final) e redesenha
# as garras das duas mãos como três lâminas limpas, de aço com fio roxo na ponta.
EVO_ERASE = [(0, 20, 9, 31), (0, 27, 17, 50), (17, 34, 31, 41), (84, 14, 99, 34), (79, 33, 99, 50), (76, 41, 80, 47), (12, 24, 16, 28), (17, 40, 20, 43), (24, 31, 30, 34), (14, 45, 29, 57), (44, 49, 58, 54)]
EVO_BLADES = [((80, 36), (93, 47)), ((79, 38), (88, 50)), ((81, 35), (96, 42)),  # mão direita
              ((18, 31), (3, 42)), ((19, 33), (7, 47)), ((17, 30), (1, 36))]  # mão esquerda


def polish_evo(o):
    o = o.copy()
    for x0, y0, x1, y1 in EVO_ERASE:
        o[y0:y1, x0:x1] = 0
    steel, mid, edge, dark = (216, 208, 232, 255), (138, 128, 168, 255), (154, 74, 216, 255), (22, 14, 30, 255)
    h, w = o.shape[:2]
    line = lambda a, b: [(round(a[0] + (b[0] - a[0]) * t / 40), round(a[1] + (b[1] - a[1]) * t / 40)) for t in range(41)]
    pts = [[*dict.fromkeys(line(a, b))] for a, b in EVO_BLADES]
    # Contorno escuro primeiro (em volta de cada lâmina), depois o aço, com o fio roxo na ponta.
    for ps in pts:
        for x, y in ps:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if 0 <= x + dx < w and 0 <= y + dy < h and not o[y + dy, x + dx, 3]:
                        o[y + dy, x + dx] = dark
    for ps in pts:
        n = len(ps)
        for k, (x, y) in enumerate(ps):
            if 0 <= x < w and 0 <= y < h:
                o[y, x] = edge if k > n * 0.8 else steel if k % 3 else mid
    return o


def main(debug=None):
    rgb = np.asarray(Image.open(SRC).convert('RGB'))
    base = body_mask(rgb, (96, 84, 318, 266))
    evo = body_mask(rgb, (566, 70, 884, 266), ground_rows=34)
    if debug:
        for im, name in ((base, 'p1_cut'), (evo, 'p3_cut')):
            bgc = Image.new('RGBA', im.size, (255, 0, 255, 255)); bgc.alpha_composite(im)
            bgc.resize((im.width * 2, im.height * 2), Image.NEAREST).save(Path(debug) / f'{name}.png')
    # Olhos: na redução viram 1 pixel escuro. Acha o brilho dos olhos na arte (amarelo na base, rosa na evolução),
    # leva para a escala do sprite e carimba 2 px acesos com um brilho branco (depois da paleta, senão ela os engole).
    for spr, name, h, eye in ((base, 'panther_1', 36, 'yellow'), (evo, 'panther_3', 58, 'pink')):
        small = crisp(spr, h - 2)
        a = np.asarray(small).astype(np.int32)
        a[..., :3] = np.clip(a[..., :3] * 1.22 + 6, 0, 255)  # a arte é bem escura para as arenas claras
        # Fiapos soltos da aura (pedaços pequenos separados do corpo) saem.
        n, lab, st, _ = cv2.connectedComponentsWithStats((a[..., 3] > 0).astype(np.uint8), connectivity=4)
        big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        a[(lab != big) & (lab > 0)] = 0
        small = snap(Image.fromarray(a.astype(np.uint8), 'RGBA'), 26)
        bbox = small.getbbox()
        small = outline(small.crop(bbox))
        o = np.asarray(small).copy()
        full = np.asarray(spr).astype(np.int32)
        r, g, b, al = full[..., 0], full[..., 1], full[..., 2], full[..., 3]
        lit = (al > 0) & ((r > 150) & (g > 100) & (b < 160) if eye == 'yellow' else (r > 180) & (b > 170) & (g < 150))
        lit[int(full.shape[0] * 0.4):] = False  # só na cabeça (garras e lâminas também brilham)
        lit = cv2.dilate(lit.astype(np.uint8), np.ones((5, 5), np.uint8)) & lit.astype(np.uint8)  # junta fragmentos
        n, lab, st, cen = cv2.connectedComponentsWithStats(cv2.dilate(lit, np.ones((5, 5), np.uint8)))
        sx, sy = a.shape[1] / spr.width, a.shape[0] / spr.height
        col = (255, 214, 58, 255) if eye == 'yellow' else (255, 110, 255, 255)
        for k in sorted(range(1, n), key=lambda k: -st[k, cv2.CC_STAT_AREA])[:2]:
            if st[k, cv2.CC_STAT_AREA] < 6:
                continue
            ex, ey = int(cen[k][0] * sx) - bbox[0] + 1, int(cen[k][1] * sy) - bbox[1] + 1
            for dx in (0, 1):
                if 0 <= ex + dx < o.shape[1] and o[ey, ex + dx, 3]:
                    o[ey, ex + dx] = col
            if o[ey, ex, 3]:
                o[ey, ex] = (255, 255, 230, 255)
        if name == 'panther_3':
            o = polish_evo(o)
        small = Image.fromarray(o, 'RGBA')
        small.save(OUT / f'{name}.png')
        print(name, small.size)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
