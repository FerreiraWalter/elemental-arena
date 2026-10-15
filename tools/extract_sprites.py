"""Extrai os sprites dos monstros da folha de arte (assets/source/monstros_evolucoes.webp).

A folha tem 3 linhas (fogo, água, planta) x 3 estágios sobre fundo azul-marinho.
Pipeline: remove o fundo (flood fill a partir das bordas), recorta cada sprite, reduz para a
densidade de pixels do jogo (média por área), limita a paleta e refaz o contorno de 1 px.

Uso: python tools/extract_sprites.py   (gera assets/monsters/*.png e assets/monsters/preview.png)
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'source' / 'monstros_evolucoes.webp'
OUT = ROOT / 'assets' / 'monsters'

LINES = ['fire', 'water', 'plant']
# Altura final (px de arte) de cada estágio no jogo; o jogo usa os estágios 1 e 3 (ver species.js).
TARGET_H = {
    'fire': [30, 40, 50],
    'water': [24, 34, 44],
    'plant': [32, 44, 54],
}
COLORS = 24  # cores por sprite
BG_TOL = 34


def remove_background(im):
    w, h = im.size
    px = im.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    near = lambda c: sum((c[i] - bg[i]) ** 2 for i in range(3)) <= BG_TOL ** 2
    is_bg = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if is_bg[i] or not near(px[x, y]):
            continue
        is_bg[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    # Também remove bolsões internos da cor exata do fundo (vãos entre braços e pernas).
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if sum((c[i] - bg[i]) ** 2 for i in range(3)) <= (BG_TOL * 0.6) ** 2:
                is_bg[y * w + x] = 1
    out = im.convert('RGBA')
    op = out.load()
    for y in range(h):
        for x in range(w):
            if is_bg[y * w + x]:
                op[x, y] = (0, 0, 0, 0)
    return out, bg


def bbox_alpha(im, min_px=12):
    """Caixa dos pixels opacos, ignorando ruído isolado."""
    a = im.getchannel('A')
    w, h = im.size
    data = a.load()
    cols = [sum(1 for y in range(h) if data[x, y] > 0) for x in range(w)]
    rows = [sum(1 for x in range(w) if data[x, y] > 0) for y in range(h)]
    xs = [x for x, n in enumerate(cols) if n >= 2]
    ys = [y for y, n in enumerate(rows) if n >= 2]
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def find_sprites(im, k=4, gap=3, nrows=3, ncols=3):
    """Agrupa componentes conexos (em resolução 1/k) em 9 sprites, ordenados por linha e coluna."""
    w, h = im.size
    sw, sh = w // k, h // k
    a = im.getchannel('A').resize((sw, sh), Image.BOX).load()
    fg = [[a[x, y] > 40 for x in range(sw)] for y in range(sh)]
    seen = [[False] * sw for _ in range(sh)]
    comps = []
    for y in range(sh):
        for x in range(sw):
            if not fg[y][x] or seen[y][x]:
                continue
            q = deque([(x, y)]); seen[y][x] = True
            x0 = x1 = x; y0 = y1 = y; n = 0
            while q:
                cx, cy = q.popleft(); n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < sw and 0 <= ny < sh and fg[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True; q.append((nx, ny))
            comps.append([x0, y0, x1, y1, n])
    # Junta componentes próximos (partículas de fogo, gotas) ao corpo principal.
    merged = True
    while merged:
        merged = False
        for i in range(len(comps)):
            for j in range(i + 1, len(comps)):
                A, B = comps[i], comps[j]
                if A[0] - gap <= B[2] and B[0] - gap <= A[2] and A[1] - gap <= B[3] and B[1] - gap <= A[3]:
                    comps[i] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3]), A[4] + B[4]]
                    comps.pop(j); merged = True; break
            if merged: break
    big = sorted(comps, key=lambda c: -c[4])[:nrows * ncols]
    rows = [[] for _ in range(nrows)]
    for c in big:
        cy = (c[1] + c[3]) / 2 * k
        rows[min(nrows - 1, int(cy / (h / nrows)))].append(c)
    out = []
    for r in rows:
        assert len(r) == ncols, f'esperava {ncols} sprites por linha, achei {len(r)}'
        r.sort(key=lambda c: c[0])
        out.append([(c[0] * k, c[1] * k, (c[2] + 1) * k, (c[3] + 1) * k) for c in r])
    return out


def keep_group(spr, box, _g, _full):
    return spr


def downscale(sprite, target_h):
    w, h = sprite.size
    tw = max(1, round(w * target_h / h))
    # Média por área ponderada pelo alfa (sem "vazar" o preto do fundo transparente).
    rgba = sprite.load()
    out = Image.new('RGBA', (tw, target_h))
    op = out.load()
    sx, sy = w / tw, h / target_h
    for oy in range(target_h):
        for ox in range(tw):
            x0, x1 = int(ox * sx), max(int(ox * sx) + 1, int((ox + 1) * sx))
            y0, y1 = int(oy * sy), max(int(oy * sy) + 1, int((oy + 1) * sy))
            r = g = b = a = n = 0
            for y in range(y0, min(y1, h)):
                for x in range(x0, min(x1, w)):
                    pr, pg, pb, pa = rgba[x, y]
                    n += 1
                    if pa:
                        r += pr; g += pg; b += pb; a += 1
            if a / max(1, n) >= 0.45:
                op[ox, oy] = (r // a, g // a, b // a, 255)
    return out


def quantize(sprite, colors):
    alpha = sprite.getchannel('A')
    rgb = sprite.convert('RGB')
    q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.putalpha(alpha.point(lambda v: 255 if v > 0 else 0))
    return q


def outline(sprite):
    """Contorno escuro de 1 px nas bordas externas, tingido pela cor vizinha."""
    w, h = sprite.size
    out = Image.new('RGBA', (w + 2, h + 2))
    out.paste(sprite, (1, 1))
    px = out.load()
    src = out.copy().load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            neigh = [src[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and src[x + dx, y + dy][3]]
            if neigh:
                r = sum(c[0] for c in neigh) // len(neigh)
                g = sum(c[1] for c in neigh) // len(neigh)
                b = sum(c[2] for c in neigh) // len(neigh)
                px[x, y] = (r // 6 + 8, g // 6 + 6, b // 6 + 10, 255)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert('RGB')
    clean, bg = remove_background(im)
    W, H = clean.size
    groups = find_sprites(clean)
    sprites = {}
    for row, line in enumerate(LINES):
        for col in range(3):
            box = groups[row][col]
            spr = clean.crop(box)
            # Apaga pedaços de sprites vizinhos que caíram dentro da caixa.
            spr = keep_group(spr, box, groups[row][col], clean)
            small = outline(quantize(downscale(spr, TARGET_H[line][col] - 2), COLORS))
            name = f'{line}_{col + 1}.png'
            small.save(OUT / name)
            sprites[name] = small
            print(name, small.size, 'fundo', bg)
    # Prévia ampliada 4x para conferir.
    scale = 4
    pw = sum(s.size[0] for s in list(sprites.values())[:3]) * scale + 80
    prev = Image.new('RGBA', (max(pw, 700), (60 * scale) * 3 + 40), (43, 47, 96, 255))
    for row, line in enumerate(LINES):
        x = 10
        for col in range(3):
            s = sprites[f'{line}_{col + 1}.png']
            big = s.resize((s.size[0] * scale, s.size[1] * scale), Image.NEAREST)
            prev.alpha_composite(big, (x, 10 + row * 60 * scale + (60 * scale - big.size[1]) // 2))
            x += big.size[0] + 20
    prev.save(OUT / 'preview.png')


if __name__ == '__main__':
    main()
