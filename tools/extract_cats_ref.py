"""Raiolua e Trovogato a partir da arte de referência (cena com fundo de floresta e aura elétrica).

Pipeline: contorno aproximado traçado à mão (polígono, em coordenadas da imagem) -> GrabCut do OpenCV refina o
recorte pelo conteúdo -> no Trovogato, tira os raios da aura (ciano muito claro e saturado; o jogo desenha os efeitos)
-> reduz para a densidade de pixels do jogo -> paleta limitada -> contorno de 1 px (funções de extract_sprites.py).

Uso: python tools/extract_cats_ref.py CAMINHO_DA_IMAGEM   (gera assets/monsters/cat_1.png e cat_3.png)
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sprites import downscale, quantize, outline, bbox_alpha  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'monsters'

# Contornos (sentido horário) e altura final no jogo.
RAIOLUA = [(168, 596), (178, 600), (205, 586), (222, 592), (240, 594), (248, 606), (262, 612), (266, 622), (250, 630), (242, 640),
           (246, 660), (238, 676), (238, 700), (228, 714), (212, 724), (198, 742), (186, 748), (182, 770), (162, 773), (150, 762),
           (140, 744), (128, 727), (117, 709), (121, 690), (140, 676), (160, 668), (176, 660), (178, 640), (158, 629), (152, 618), (165, 608)]
TROVOGATO = [(420, 445), (450, 425), (445, 398), (470, 410), (500, 398), (540, 378), (548, 410), (575, 418), (598, 428), (570, 450),
             (552, 462), (552, 505), (600, 520), (630, 545), (640, 585), (650, 630), (652, 690), (660, 720), (690, 760), (690, 840),
             (670, 860), (660, 880), (684, 905), (612, 910), (612, 880), (625, 860), (620, 830), (590, 800), (560, 810), (520, 790),
             (500, 800), (490, 830), (470, 850), (480, 880), (490, 905), (420, 910), (430, 885), (445, 860), (420, 860), (400, 840),
             (400, 800), (430, 790), (445, 760), (440, 720), (420, 700), (415, 640), (420, 580), (435, 540), (445, 515), (470, 505),
             (470, 470), (445, 460)]
# Partes finas que o GrabCut tende a cortar (perna e pé esquerdos, cauda, orelha): marcadas como "certamente personagem".
TROVO_SURE = [[(438, 800), (470, 800), (466, 880), (440, 880)], [(418, 886), (486, 886), (486, 906), (418, 906)],
              [(404, 812), (430, 806), (440, 850), (414, 858)], [(446, 402), (462, 410), (460, 424), (448, 422)]]
RAIO_SURE = [[(146, 742), (176, 742), (174, 768), (152, 766)], [(170, 598), (182, 604), (178, 616), (170, 612)]]
JOBS = [('cat_1', RAIOLUA, 40, False, RAIO_SURE), ('cat_3', TROVOGATO, 58, False, TROVO_SURE)]

# Paleta escolhida a partir da arte: cada pixel reduzido vira a cor mais próxima (em Lab) desta lista. É o que dá cara de
# pixel art (cores limpas e contraste) em vez da "lama" da média de cores.
PALETTE = [
    '#12162a', '#232a44',                         # contorno / sombra mais escura
    '#f2eee6', '#d6d4d6', '#a9adbb', '#7c8496',   # pelo claro do siamês e quimono branco (luz -> sombra)
    '#2e2a30', '#4a4048', '#6a5c60',              # pontas escuras do siamês (orelhas, rosto, patas, cauda)
    '#18234e', '#24357a', '#3550a8', '#5577cc',   # azul-marinho do colete/faixa
    '#7a5a22', '#b08a3c', '#dcb55a', '#f4d98a',   # dourado do chapéu e dos bordados
    '#8ff0ff', '#ffffff', '#3fb8ff',              # olhos e brilho elétrico
]


# Pintura por MATERIAL: cada pixel é classificado (palha/dourado, olho, azul-marinho, claro, escuro, raio) e ganha a cor
# da rampa daquele material; o tom vem da luminosidade da arte. Isso tira a luz azul da cena do rosto e do quimono.
def hexes(*h):
    return [tuple(int(x[i:i + 2], 16) for i in (1, 3, 5)) for x in h]


RAMPS = {
    'gold': hexes('#5e3f16', '#94702c', '#c89f48', '#ecc874', '#fbe7a6'),
    'navy': hexes('#0f1532', '#18245a', '#24387e', '#33509e'),
    'dark': hexes('#171315', '#2a2326', '#3f3538', '#5a4c4f', '#786669'),
    'cream': hexes('#8a8079', '#b8ab9f', '#dcd0c0', '#f2e9dc', '#fffaf2'),
    'white': hexes('#66728a', '#97a3ba', '#c3cddd', '#dfe5ef', '#eef1f6'),
    'eye': hexes('#3fd0ff', '#9ff6ff', '#ffffff'),
    'bolt': hexes('#3f9cff', '#8fe2ff', '#e6fbff'),
}


def material(sprite, cool_light_is_fur):
    a = np.array(sprite.convert('RGBA'))
    rgb = a[..., :3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    cls = np.full(H.shape, 'dark', object)
    light = V > 135
    cls[light & (r >= b - 6)] = 'cream'
    cls[light & (r < b - 6)] = 'cream' if cool_light_is_fur else 'white'
    cls[(H >= 100) & (H <= 130) & (S > 95) & (V <= 200)] = 'navy'
    cls[(H >= 100) & (H <= 128) & (S > 70) & (V > 200) & (S < 150)] = 'navy'
    cls[(H >= 8) & (H <= 34) & (S > 60) & (V > 60)] = 'gold'
    cls[(H >= 82) & (H <= 104) & (S > 110) & (V > 190)] = 'bolt'
    out = rgb.copy()
    for name in set(cls[a[..., 3] > 0].ravel()):
        sel = (cls == name) & (a[..., 3] > 0)
        ramp = RAMPS['eye' if name == 'bolt' and not cool_light_is_fur and False else name]
        v = V[sel].astype(float)
        lo, hi = np.percentile(v, 4), np.percentile(v, 96)
        k = np.clip((v - lo) / max(1.0, hi - lo), 0, 0.999)
        idx = (k * len(ramp)).astype(int)
        out[sel] = np.array(ramp, np.uint8)[idx]
    a[..., :3] = out
    return Image.fromarray(a, 'RGBA')


def remap(sprite):
    pal = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PALETTE], np.uint8).reshape(-1, 1, 3)
    pal_lab = cv2.cvtColor(pal, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    a = np.array(sprite.convert('RGBA'))
    rgb = a[..., :3].copy()
    # Um pouco mais de saturação e contraste antes do mapeamento (a arte de referência é escura e azulada).
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.25, 0, 255)
    hsv[..., 2] = np.clip((hsv[..., 2] - 128) * 1.15 + 140, 0, 255)
    rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    lab = cv2.cvtColor(rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    d = ((lab[:, None, :] - pal_lab[None, :, :]) ** 2).sum(-1)
    idx = d.argmin(1)
    out = pal.reshape(-1, 3)[idx].reshape(rgb.shape)
    a[..., :3] = out
    return Image.fromarray(a, 'RGBA')


def cut(img_bgr, poly, strip_lightning, sure=()):
    h, w = img_bgr.shape[:2]
    pts = np.array(poly, np.int32)
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    cv2.fillPoly(mask, [pts], cv2.GC_PR_FGD)
    # Miolo: o contorno encolhido em direção ao centro é "certamente personagem".
    c = pts.mean(axis=0)
    inner = ((pts - c) * 0.55 + c).astype(np.int32)
    cv2.fillPoly(mask, [inner], cv2.GC_FGD)
    for sp in sure:
        cv2.fillPoly(mask, [np.array(sp, np.int32)], cv2.GC_FGD)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img_bgr, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    if strip_lightning:
        b, g, r = img_bgr[..., 0].astype(int), img_bgr[..., 1].astype(int), img_bgr[..., 2].astype(int)
        bolt = (b > 238) & (g > 195) & (b - r > 70) & (r < 175)  # só o ciano puro dos raios (mangas e quimono têm vermelho alto)
        fg &= ~bolt
    # Maior região conectada (descarta faíscas soltas que o GrabCut deixou).
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 4)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = lab == big
        for k in range(1, n):
            if k != big and stats[k, cv2.CC_STAT_AREA] > stats[big, cv2.CC_STAT_AREA] * 0.04:
                keep |= lab == k
        fg = keep
    # Fecha furinhos internos.
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    rgba = np.dstack([rgb, (fg * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, 'RGBA')
    box = bbox_alpha(im)
    return im.crop(box), box


# Regiões do corpo (coordenadas da imagem de referência): a COR vem da região, só o SOMBREADO vem da arte.
# Cada região: (teste do ponto, material claro, material escuro, limiar de brilho). O dourado é detectado pela cor
# (inconfundível) e vale em qualquer região; olhos e raios também.
def _in(poly, x, y):
    return cv2.pointPolygonTest(np.array(poly, np.int32), (float(x), float(y)), False) >= 0


REGIONS = {
    'cat_1': [  # Raiolua
        (lambda x, y: (166 <= x <= 186 and 592 <= y <= 622) or (236 <= x <= 252 and 590 <= y <= 612), 'dark', 'dark', 999),  # orelhas
        (lambda x, y: y < 634, 'gold', 'gold', 0),                                                                   # chapéu
        (lambda x, y: y < 672 and x > 172, 'cream', 'dark', 150),                                                    # cabeça (máscara escura do siamês)
        (lambda x, y: y > 742, 'cream', 'dark', 140),                                                                # patas
        (lambda x, y: 200 <= x <= 245 and 688 <= y <= 716, 'cream', 'dark', 140),                                    # braço/pata dianteira
        (lambda x, y: True, 'cream', 'navy', 138),                                                                   # colete (azul) e pelo
    ],
    'cat_3': [  # Trovogato
        (lambda x, y: (440 <= x <= 468 and 396 <= y <= 426) or (528 <= x <= 552 and 376 <= y <= 414), 'dark', 'dark', 999),  # orelhas
        (lambda x, y: y < 472 and not (458 <= x <= 552 and y > 455), 'gold', 'gold', 0),                             # chapéu
        (lambda x, y: 452 <= x <= 556 and 440 <= y <= 512, 'cream', 'dark', 150),                                    # cabeça
        (lambda x, y: y > 884, 'dark', 'dark', 999),                                                                 # pés
        (lambda x, y: (x > 640 and y > 700) or (x < 446 and y > 792), 'dark', 'dark', 999),                          # cauda
        (lambda x, y: (418 <= x <= 448 and 688 <= y <= 730) or (622 <= x <= 656 and 690 <= y <= 730), 'dark', 'dark', 999),  # mãos
        (lambda x, y: True, 'white', 'navy', 112),                                                                   # quimono, colete, mangas, calças
    ],
}


def paint(full, name, box):
    """Repinta o recorte em resolução cheia: região -> material claro/escuro pelo brilho; tom pela luminosidade."""
    a = np.array(full.convert('RGBA'))
    rgb = a[..., :3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    hgt, wid = V.shape
    mat = np.full((hgt, wid), '', object)
    regs = REGIONS[name]
    for yy in range(hgt):
        for xx in range(wid):
            if a[yy, xx, 3] == 0:
                continue
            X, Y = xx + box[0], yy + box[1]
            for test, light, dark, thr in regs:
                if test(X, Y):
                    mat[yy, xx] = light if V[yy, xx] > thr else dark
                    break
            if 8 <= H[yy, xx] <= 34 and S[yy, xx] > 70 and V[yy, xx] > 70:
                mat[yy, xx] = 'gold'
            if 80 <= H[yy, xx] <= 104 and S[yy, xx] > 100 and V[yy, xx] > 200:
                mat[yy, xx] = 'eye' if mat[yy, xx] in ('cream', 'dark') else 'bolt'
    # Suaviza o mapa de materiais (tira manchinhas soltas antes de reduzir): mediana dos índices dos materiais.
    names = sorted(set(mat[a[..., 3] > 0].ravel()))
    ids = np.zeros(mat.shape, np.uint8)
    for k, m in enumerate(names):
        ids[mat == m] = k + 1
    ids = cv2.medianBlur(ids, 9 if name == 'cat_3' else 5)  # o quimono tem áreas grandes: suaviza mais
    for k, m in enumerate(names):
        mat[(ids == k + 1) & (a[..., 3] > 0)] = m
    out = rgb.copy()
    for m in set(mat[a[..., 3] > 0].ravel()) - {''}:
        sel = (mat == m) & (a[..., 3] > 0)
        ramp = RAMPS[m]
        v = V[sel].astype(float)
        lo, hi = np.percentile(v, 3), np.percentile(v, 97)
        k = np.clip((v - lo) / max(1.0, hi - lo), 0, 0.999)
        out[sel] = np.array(ramp, np.uint8)[(k * len(ramp)).astype(int)]
    a[..., :3] = out
    return Image.fromarray(a, 'RGBA')


def snap(sprite):
    """Depois de reduzir, cada pixel volta para a cor mais próxima das rampas (pixel art limpa, sem tons misturados)."""
    allc = np.array(sorted({c for r in RAMPS.values() for c in r}), np.float32)
    a = np.array(sprite.convert('RGBA'))
    rgb = a[..., :3].reshape(-1, 3).astype(np.float32)
    idx = ((rgb[:, None, :] - allc[None, :, :]) ** 2).sum(-1).argmin(1)
    a[..., :3] = allc[idx].reshape(a.shape[0], a.shape[1], 3).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


# Acentos que somem na redução mas definem o personagem (coordenadas da referência): olhos brilhando em ciano.
ACCENTS = {'cat_3': [(474, 457), (514, 454)], 'cat_1': [(214, 656)]}


def accents(spr, name, box, full_h, target_h):
    f = target_h / full_h
    px = spr.load()
    for X, Y in ACCENTS.get(name, []):
        x, y = int(round((X - box[0]) * f)) + 1, int(round((Y - box[1]) * f)) + 1  # +1: contorno de 1 px
        for dx, c in ((0, (255, 255, 255, 255)), (1, (159, 246, 255, 255))):
            if 0 <= x + dx < spr.width and 0 <= y < spr.height and px[x + dx, y][3]:
                px[x + dx, y] = c
    return spr


def main():
    src = sys.argv[1]
    pil = Image.open(src).convert('RGB')
    img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    for name, poly, target_h, strip, sure in JOBS:
        full, box = cut(img, poly, strip, sure)
        spr = paint(full, name, box)
        spr = downscale(spr, target_h)
        spr = snap(spr)
        spr = outline(spr)
        spr = accents(spr, name, box, full.height, target_h)
        spr.save(OUT / f'{name}.png')
        print(name, spr.size)


if __name__ == '__main__':
    main()
