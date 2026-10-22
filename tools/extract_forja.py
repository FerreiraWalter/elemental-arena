"""Recorta Brasalinha (forma base) e Fornalhonte (evolução) da arte de referência e gera os sprites.
O fundo é uma caverna escura com tons parecidos com a armadura de pedra, então a máscara junta duas coisas:
GrabCut (separa a armadura escura da caverna pela forma) e os pixels de fogo (laranja/amarelo saturados).
Fica tudo que é pedaço grande (as pernas da Brasalinha se separam do corpo por rachaduras escuras); a seta do meio
da arte é apagada. Depois: redução que escolhe a cor típica de cada bloco (sem média), paleta curta e contorno de 1 px.
A forma base mantém o corpo da primeira arte (brasalinha.webp) e ganha só a máscara de dragão nova.
Uso: python tools/extract_forja.py [assets/source/brasalinha2.webp]   (gera assets/monsters/forge_1.png e forge_3.png)"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sprites import outline  # noqa: E402
from extract_frogs import snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'monsters'
# nome, caixa (x0, y0, x1, y1), altura final (px), retângulos a apagar (a seta entre as duas formas)
JOBS = [
    ('forge_3', (440, 88, 1013, 876), 68, [(395, 455, 553, 560)]),
]


def cut(img, box, erase):
    x0, y0, x1, y1 = box
    bgr = np.ascontiguousarray(img[..., ::-1])
    gc = np.zeros(img.shape[:2], np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, gc, (x0, y0, x1 - x0, y1 - y0), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    sub = img[y0:y1, x0:x1].astype(np.int32)
    fire = ((sub.max(-1) - sub.min(-1) > 55) & (sub.max(-1) > 95))
    m = (((gc[y0:y1, x0:x1] == 1) | (gc[y0:y1, x0:x1] == 3)) | fire).astype(np.uint8)
    for ex0, ey0, ex1, ey1 in erase:
        m[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    big = st[1:, cv2.CC_STAT_AREA].max()
    keep = np.isin(lab, [k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] > big * 0.03]).astype(np.uint8)
    # Buracos pequenos (entre escamas) viram corpo; vãos grandes (entre asa e corpo) continuam vazios.
    n2, l2, s2, _ = cv2.connectedComponentsWithStats(1 - keep, 4)
    for k in range(1, n2):
        if s2[k, cv2.CC_STAT_AREA] < 400: keep[l2 == k] = 1
    im = Image.fromarray(np.dstack([img[y0:y1, x0:x1], keep * 255]).astype(np.uint8), 'RGBA')
    return im.crop(im.getbbox())


def crisp(sprite, target_h):
    """Redução sem misturar cores: cada pixel final pega a cor do pixel mais "típico" do bloco (o mais perto da
    mediana do bloco), e fica opaco se a maior parte do bloco é corpo. A arte já é pixel art (~8-12 px por pixel),
    então isso preserva olhos, gema e placas da máscara em vez de virar uma média marrom."""
    w, h = sprite.size
    tw = max(1, round(w * target_h / h))
    a = np.asarray(sprite).astype(np.int32)
    out = np.zeros((target_h, tw, 4), np.uint8)
    sx, sy = w / tw, h / target_h
    for oy in range(target_h):
        for ox in range(tw):
            x0, x1 = int(ox * sx), max(int(ox * sx) + 1, int((ox + 1) * sx))
            y0, y1 = int(oy * sy), max(int(oy * sy) + 1, int((oy + 1) * sy))
            blk = a[y0:y1, x0:x1].reshape(-1, 4)
            on = blk[blk[:, 3] > 0]
            if len(on) < len(blk) * 0.45: continue
            med = np.median(on[:, :3], axis=0)
            pick = on[np.argmin(((on[:, :3] - med) ** 2).sum(1))]
            out[oy, ox] = (*pick[:3], 255)
    return Image.fromarray(out, 'RGBA')


# Máscaras de dragão desenhadas à mão (a redução deixa o rosto de pedra ilegível). '.' mantém o pixel da arte.
# K contorno · D/M/L placas escuras/médias/claras · O rachadura em brasa · Y/W olho · R/P gema · G ouro · T dente.
HEAD_COLORS = {
    'K': (0x1a, 0x12, 0x14), 'D': (0x2e, 0x26, 0x29), 'M': (0x4a, 0x40, 0x44), 'L': (0x6e, 0x62, 0x64),
    'O': (0xff, 0x7a, 0x1a), 'Y': (0xff, 0xc8, 0x2a), 'W': (0xff, 0xf4, 0xb0), 'R': (0xd8, 0x1e, 0x28),
    'P': (0xff, 0x8a, 0x8a), 'G': (0xe0, 0xa0, 0x30), 'T': (0xe8, 0xdc, 0xc8),
}
HEADS = {
    'forge_1': ((23, 6), [
        '..K.........K..',
        '.KDK.......KDK.',
        '.KMDK.KKK.KDMK.',
        '..KMDKGRGKDMK..',
        '..KDMKRPRKMDK..',
        '.KDDMMKGKMMDDK.',
        '.KMOMDDMDDMOMK.',
        'KDMKKMMMMMKKMDK',
        'KDKYWKDMDKWYKDK',
        'KDMKOKMLMKOKMDK',
        '.KDMMDMLMDMMDK.',
        '..KDMOKLKOMDK..',
        '..KTKDDDDDKTK..',
        '...KTKKKKKTK...',
        '....KKOOOKK....',
    ]),
    'forge_3': ((17, 16), [
        '.K.............K.',
        'KDK...........KDK',
        'KDMK..K...K..KMDK',
        '.KDMK.KG.GK.KMDK.',
        '..KDMKKGRGKKMDK..',
        '..KMDDKRPRKDDMK..',
        '.KDMMDDKGKDDMMDK.',
        '.KMOMMDDMDDMMOMK.',
        'KDMKKKMMMMMKKKMDK',
        'KDKYYWKDMDKWYYKDK',
        'KDMKOOKMLMKOOKMDK',
        '.KDMMMDMLMDMMMDK.',
        '.KDKMOMKLKMOMKDK.',
        '..KTKKDDDDDKKTK..',
        '..KTOTKKKKKTOTK..',
        '...KTKOOOOOKTK...',
        '....KKKKKKKKK....',
    ]),
}


def stamp_head(spr, name):
    if name not in HEADS: return
    (x0, y0), rows = HEADS[name]
    px = spr.load()
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != '.' and 0 <= x0 + i < spr.width and 0 <= y0 + j < spr.height: px[x0 + i, y0 + j] = (*HEAD_COLORS[ch], 255)


# ───── Forma base: o corpo é o da primeira arte (assets/source/brasalinha.webp); só a máscara é nova ─────
LEGACY = ((140, 150, 415, 412), (300, 300), 42, [(0, 0, 225, 335)])


def legacy_base():
    """Brasalinha da primeira arte: fundo marrom liso, fumaça cinza do rabo apagada, redução por média de área."""
    from extract_sprites import downscale
    box, seed, h, smoke = LEGACY
    a = np.asarray(Image.open(ROOT / 'assets' / 'source' / 'brasalinha.webp').convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    bg = np.median(np.concatenate([sub[0], sub[-1], sub[:, 0], sub[:, -1]]), axis=0)
    far = np.abs(sub - bg).sum(-1) > 42
    grey = (sub.max(-1) - sub.min(-1)) < 34
    sm = np.zeros(far.shape, bool)
    for sx0, sy0, sx1, sy1 in smoke:
        sm[max(0, sy0 - y0):max(0, sy1 - y0), max(0, sx0 - x0):max(0, sx1 - x0)] = True
    mask = ((far & ~(grey & sm)) * 255).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=1)
    _, lab = cv2.connectedComponents(mask)
    keep = (lab == lab[seed[1] - y0, seed[0] - x0]).astype(np.uint8) * 255
    ff = keep.copy(); hh, ww = ff.shape
    cv2.floodFill(ff, np.zeros((hh + 2, ww + 2), np.uint8), (0, 0), 255)
    keep = keep | (cv2.bitwise_not(ff) & (far * 255).astype(np.uint8))
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, k3, iterations=1) > 0
    im = Image.fromarray(np.dstack([sub, keep * 255]).astype(np.uint8), 'RGBA')
    spr = downscale(im.crop(im.getbbox()), h - 2)
    rgb = ImageEnhance.Color(spr.convert('RGB')).enhance(1.25)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    spr = Image.merge('RGBA', (*rgb.split(), spr.getchannel('A')))
    al = (np.asarray(spr.getchannel('A')) > 0).astype(np.uint8)
    n, lab2, stats, _ = cv2.connectedComponentsWithStats(al, connectivity=8)
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    spr.putalpha(Image.fromarray(((lab2 == big) * 255).astype(np.uint8)))
    spr = outline(snap(spr, 28))
    stamp_head(spr, 'forge_1')
    spr.save(OUT / 'forge_1.png')
    print('forge_1', spr.size)


def main():
    img = np.asarray(Image.open(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'assets' / 'source' / 'brasalinha2.webp').convert('RGB'))
    for name, box, h, erase in JOBS:
        spr = crisp(cut(img, box, erase), h - 2)
        rgb = ImageEnhance.Contrast(spr.convert('RGB')).enhance(1.08)
        spr = Image.merge('RGBA', (*rgb.split(), spr.getchannel('A')))
        al = (np.asarray(spr.getchannel('A')) > 0).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(al, connectivity=8)
        big = stats[1:, cv2.CC_STAT_AREA].max()
        spr.putalpha(Image.fromarray((np.isin(lab, [k for k in range(1, n) if stats[k, cv2.CC_STAT_AREA] >= max(6, big * 0.02)]) * 255).astype(np.uint8)))
        spr = outline(snap(spr, 30))
        stamp_head(spr, name)
        spr.save(OUT / f'{name}.png')
        print(name, spr.size)
    legacy_base()


if __name__ == '__main__':
    main()
