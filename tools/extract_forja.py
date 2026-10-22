"""Gera os sprites da Brasalinha (forma base) e do Fornalhonte (evolução).
Base: corpo da primeira arte (assets/source/brasalinha.webp) com uma máscara de dragão desenhada à mão por cima.
Evolução: desenhada em código (peças com luz e textura) para continuar a base: mesma máscara de dragão com gema,
juba de chamas, corpo de lava e rabo em chama, agora grande e com armadura de rocha.
Uso: python tools/extract_forja.py   (gera assets/monsters/forge_1.png e forge_3.png)"""
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


# ───── Evolução (Fornalhonte): desenhado em código para continuar a Brasalinha ─────
# A conversão da arte do golem (assets/source/fornalhonte.webp) virava um bloco escuro com chifres de galho, sem nada
# da base. Agora o corpo é montado por peças (tubos e elipses com luz de cima à esquerda e textura de ruído) com o que a
# Brasalinha tem: máscara de dragão escura com gema vermelha e olhos amarelos, juba de chamas, corpo de lava com
# pedrinhas e rabo longo com ponta em chama. Do golem ficam as ombreiras, braceletes e joelheiras de rocha.
EVO_W, EVO_H, EVO_CX = 67, 66, 33
EVO_LAVA = ['5a0f08', '8c1b0d', 'bf3c0d', 'ef4007', 'ff8705', 'ffb915', 'fed323']
EVO_ROCK = ['1f1719', '2e2629', '4a4044', '6e6264']
EVO_FLAME = ['ab230a', 'ef4007', 'ff8705', 'ffb915', 'fed323', 'ffee3f', 'fff4b0']
EVO_LIGHT = np.array([-0.45, -0.6, 0.66]) / np.linalg.norm([-0.45, -0.6, 0.66])
# Rosto (cores de HEAD_COLORS): a máscara da base, maior e espelhada; boca em brasa (cospe o Jato de Fogo).
EVO_FACE_AT = (EVO_CX - 9, 8)
EVO_FACE = [
    '.......KKGKK.......',
    '.....KKKGRGKKK.....',
    '...KKLLKRPRKLLKK...',
    '..KMLLMKGRGKMLLMK..',
    '.KDMLMMMKGKMMMLMDK.',
    'KDOMMLMMMLMMMLMMODK',
    'KDMKKMMMMLMMMMKKMDK',
    'KDMYKKKMMLMMKKKYMDK',
    'KDKYYWYKKLKKYWYYKDK',
    'KDKOYYYKMLMKYYYOKDK',
    '.KDKOOKMMLMMKOOKDK.',
    '.KDMKKMMLLLMMKKMDK.',
    '..KDMMKKMLMKKMMDK..',
    '..KTKKOOOOOOOKKTK..',
    '..KTKOYYWWWYYOKTK..',
    '...KTOYWWWWWYOTK...',
    '...KKTKOOOOOKTKK...',
    '.....KKKKKKKKK.....',
]


class EvoCanvas:
    """Peças com nível de luz (0..1) por pixel; a cor sai da rampa do material no fim, com ruído."""
    RAMPS = [None, EVO_LAVA, EVO_ROCK, EVO_FLAME]

    def __init__(self):
        self.yy, self.xx = np.mgrid[0:EVO_H, 0:EVO_W].astype(np.float32)
        self.lev = np.zeros((EVO_H, EVO_W), np.float32)
        self.part = np.zeros((EVO_H, EVO_W), np.int16)  # ordem de desenho (para as linhas internas)
        self.kind = np.zeros((EVO_H, EVO_W), np.int8)   # 1 lava, 2 rocha, 3 chama
        self.col = np.zeros((EVO_H, EVO_W, 4), np.uint8)
        self.n = 0

    def field(self, pts):
        """Tubo por pontos (x, y, raio): distância normalizada ao eixo, normal (nx, ny) e posição u ao longo (0..1)."""
        best = np.full((EVO_H, EVO_W), np.inf, np.float32)
        nx, ny, uu = np.zeros_like(best), np.zeros_like(best), np.zeros_like(best)
        segs = max(1, len(pts) - 1)
        for i in range(segs):
            a, b = pts[i], pts[min(i + 1, len(pts) - 1)]
            for s in np.linspace(0, 1, 24):
                x, y, r = (a[k] + (b[k] - a[k]) * s for k in range(3))
                r = max(r, 0.35)
                dx, dy = self.xx - x, self.yy - y
                q = np.sqrt(dx * dx + dy * dy) / r
                m = q < best
                best[m], nx[m], ny[m], uu[m] = q[m], dx[m] / r, dy[m] / r, (i + s) / segs
        return best, nx, ny, uu

    @staticmethod
    def lit(nx, ny):
        nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
        return np.clip(nx * EVO_LIGHT[0] + ny * EVO_LIGHT[1] + nz * EVO_LIGHT[2], 0, 1)

    def paint(self, inside, level, ramp):
        self.n += 1
        self.lev[inside] = level[inside]
        self.part[inside] = self.n
        self.kind[inside] = self.RAMPS.index(ramp)
        return inside

    def tube(self, pts, ramp=EVO_LAVA, bias=0.0):
        q, nx, ny, _ = self.field(pts)
        return self.paint(q <= 1, 0.04 + 0.8 * self.lit(nx, ny) + bias, ramp)

    def ball(self, x, y, rx, ry, ramp=EVO_LAVA, bias=0.0):
        nx, ny = (self.xx - x) / rx, (self.yy - y) / ry
        return self.paint(nx * nx + ny * ny <= 1, 0.04 + 0.8 * self.lit(nx, ny) + bias, ramp)

    def flame(self, pts, bias=0.0):
        q, _, _, u = self.field(pts)
        return self.paint(q <= 1, (1 - q) * 0.75 + (1 - u) * 0.35 - 0.08 + bias, EVO_FLAME)

    def sym(self, fn, *args, **kw):
        """Desenha a peça e o espelho dela (x -> 2*CX - x)."""
        fn(*args, **kw)
        if fn == self.ball: fn(2 * EVO_CX - args[0], *args[1:], **kw)
        else: fn([(2 * EVO_CX - p[0], *p[1:]) for p in args[0]], *args[1:], **kw)

    def colorize(self):
        rnd = np.random.default_rng(7).random((EVO_H, EVO_W)).astype(np.float32)
        for k, ramp in enumerate(self.RAMPS[1:], 1):
            amp = {1: 0.16, 2: 0.07, 3: 0.04}[k]
            idx = np.clip(((self.lev + (rnd - 0.5) * 2 * amp) * len(ramp)).astype(int), 0, len(ramp) - 1)
            for i, hx in enumerate(ramp): self.col[(self.kind == k) & (idx == i)] = (*bytes.fromhex(hx), 255)

    def line(self, pts, hx, only):
        """Risco por cima da cor, só nos pixels do material `only` (veia na lava, rachadura na rocha)."""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for s in np.linspace(0, 1, 2 * int(max(abs(x1 - x0), abs(y1 - y0))) + 2):
                x, y = int(round(x0 + (x1 - x0) * s)), int(round(y0 + (y1 - y0) * s))
                if 0 <= x < EVO_W and 0 <= y < EVO_H and self.kind[y, x] == only: self.set(x, y, hx)

    def set(self, x, y, hx): self.col[y, x] = (*bytes.fromhex(hx), 255)


def evolution():
    c, CX = EvoCanvas(), EVO_CX
    # rabo (atrás de tudo): sai do quadril, abre para a esquerda e sobe, com placas de rocha e ponta em chama
    c.tube([(CX - 6, 47, 4.4), (CX - 15, 54, 3.8), (CX - 24, 54, 3.2), (CX - 30, 48, 2.7), (CX - 31, 40, 2.2)], bias=0.02)
    c.flame([(CX - 31, 41, 3.6), (CX - 32, 34, 2.8), (CX - 30, 28, 1.7), (CX - 31, 22, 0.4)], bias=0.05)
    c.flame([(CX - 29, 39, 1.7), (CX - 26, 34, 0.9), (CX - 26, 31, 0.3)])
    c.flame([(CX - 33, 40, 1.4), (CX - 35, 35, 0.7), (CX - 35, 32, 0.3)])
    for x, y in [(CX - 11, 49), (CX - 18, 52), (CX - 25, 51), (CX - 29, 46)]:
        c.ball(x, y - 0.5, 1.7, 1.4, EVO_ROCK, 0.1)
    # juba de chamas atrás da cabeça (labaredas tortas, não uma coroa)
    c.flame([(CX, 13, 7.5), (CX + 1, 6, 5), (CX - 1, 0, 0.6)], bias=0.08)
    c.flame([(CX - 4, 12, 5), (CX - 7, 6, 3.2), (CX - 6, 2, 0.5)])
    c.flame([(CX + 4, 12, 5), (CX + 6, 5, 3.0), (CX + 9, 1, 0.5)])
    c.flame([(CX - 8, 14, 3.6), (CX - 11, 9, 2.0), (CX - 10, 5, 0.4)], bias=-0.05)
    c.flame([(CX + 8, 14, 3.4), (CX + 12, 10, 2.0), (CX + 13, 6, 0.4)], bias=-0.05)
    # chifres: dos lados da cabeça, para trás e para cima (como as orelhas da base)
    c.sym(c.tube, [(CX - 7, 11, 2.3), (CX - 11, 7, 1.8), (CX - 13, 3, 1.2), (CX - 12, 0, 0.5)], EVO_ROCK, 0.12)
    # pernas, pés e joelheiras
    c.sym(c.tube, [(CX - 7, 43, 5.2), (CX - 9, 50, 4.3), (CX - 10, 56, 3.6)], bias=-0.04)
    c.sym(c.ball, CX - 11, 59, 5.5, 3, EVO_LAVA, -0.05)
    c.sym(c.ball, CX - 9, 50, 3.4, 3.0, EVO_ROCK, 0.05)
    # tronco com núcleo em brasa
    torso = c.ball(CX, 35, 11.5, 12, EVO_LAVA, -0.04)
    c.lev[torso] += 0.26 * np.clip(1 - np.hypot(c.xx - CX, (c.yy - 33) * 0.85) / 10, 0, 1)[torso]
    # braços (ombro → antebraço), bracelete de rocha e punho
    c.sym(c.tube, [(CX - 13, 25, 4.4), (CX - 17, 31, 4.0), (CX - 18, 37, 4.0)])
    c.sym(c.tube, [(CX - 18, 33, 4.3), (CX - 18, 37, 4.3)], EVO_ROCK, 0.05)
    c.sym(c.ball, CX - 18, 42, 4.6, 4.0, EVO_LAVA, 0.1)
    # ombreiras com espinhos
    c.sym(c.tube, [(CX - 13, 21, 2.0), (CX - 15, 15, 0.5)], EVO_ROCK, 0.15)
    c.sym(c.tube, [(CX - 17, 22, 1.8), (CX - 21, 17, 0.4)], EVO_ROCK, 0.1)
    c.sym(c.ball, CX - 14, 24, 6.0, 4.3, EVO_ROCK, 0.1)
    # cabeça (máscara de rocha) e focinho
    c.ball(CX, 14, 9.2, 7.5, EVO_ROCK, 0.15)
    c.ball(CX, 21, 7.5, 4.5, EVO_ROCK, 0.05)
    c.colorize()

    # veias de lava no peito
    c.line([(CX, 27), (CX, 41)], 'fed323', 1)
    c.line([(CX, 30), (CX, 36)], 'ffee3f', 1)
    for sd in (-1, 1):
        m = lambda x, sd=sd: CX + sd * x
        c.line([(m(1), 29), (m(3), 27), (m(6), 27), (m(9), 25)], 'fed323', 1)
        c.line([(m(1), 38), (m(4), 40), (m(5), 44)], 'fed323', 1)
        c.line([(m(5), 28), (m(6), 32), (m(9), 34)], 'ffb915', 1)
        c.line([(m(9), 45), (m(8), 49)], 'ffb915', 1)
        # rachaduras em brasa nas rochas
        c.line([(m(10), 23), (m(13), 25), (m(16), 24), (m(18), 26)], 'ff7a1a', 2)
        c.line([(m(17), 33), (m(19), 35), (m(18), 37)], 'ff7a1a', 2)
        c.line([(m(8), 49), (m(10), 51)], 'ff7a1a', 2)
        c.line([(m(9), 9), (m(11), 6)], 'ff7a1a', 2)
        # garras escuras nos punhos e nos pés
        for dx in (-3, -1, 1, 3):
            c.set(m(18) + dx, 46, '1f1719')
            if abs(dx) < 3: c.set(m(18) + dx, 47, '2e2629')
        for dx in (-3, 0, 3):
            c.set(m(11) + dx, 61, '1f1719'); c.set(m(11) + dx, 62, '2e2629')
    # pedrinhas escuras na lava (como a barriga da base)
    rnd = np.random.default_rng(3)
    for _ in range(30):
        y, x = rnd.integers(20, 60), rnd.integers(0, EVO_W - 1)
        if c.kind[y, x] == 1 and c.kind[y, x + 1] == 1 and c.col[y, x, 0] < 0xfe:
            c.set(x, y, '54312a'); c.set(x + 1, y, '2e2629')
            if c.kind[y + 1, x] == 1: c.set(x, y + 1, '442120')
    # linha interna onde uma peça de lava passa na frente de outra (braço sobre o tronco, perna sobre o rabo)
    inner = np.zeros((EVO_H, EVO_W), bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb_part, nb_kind = np.roll(c.part, (dy, dx), (0, 1)), np.roll(c.kind, (dy, dx), (0, 1))
        inner |= (nb_part > 0) & (nb_part < c.part) & (c.kind == 1) & (nb_kind == 1)
    c.col[inner] = (0x5a, 0x16, 0x0e, 255)
    fx, fy = EVO_FACE_AT
    for jy, row in enumerate(EVO_FACE):
        for ix, ch in enumerate(row):
            if ch != '.': c.col[fy + jy, fx + ix] = (*HEAD_COLORS[ch], 255)
    spr = Image.fromarray(c.col, 'RGBA')
    spr = outline(spr.crop(spr.getbbox()))
    spr.save(OUT / 'forge_3.png')
    print('forge_3', spr.size)


def main():
    legacy_base()
    evolution()


if __name__ == '__main__':
    main()
