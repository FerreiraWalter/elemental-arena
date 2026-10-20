"""Gera tools/pixelart/brotossauro.txt: um mini-ent (filhote do Brotossauro Ancestral). Uso: python tools/pixelart/gen_brotossauro.py tools/pixelart/brotossauro.txt"""
import math, sys
W, H = 32, 34
g = [['.'] * W for _ in range(H)]

def h(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 2147483647) & 0xffffffff
    v = (v ^ (v >> 13)) * 1274126177 & 0xffffffff
    return (v & 0xffff) / 65535

def put(x, y, c):
    if 0 <= x < W and 0 <= y < H: g[y][x] = c

def get(x, y):
    return g[y][x] if 0 <= x < W and 0 <= y < H else '.'

def ell(cx, cy, rx, ry):
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                yield x, y

BARK = ['1', '2', '3']
LEAF = ['7', '8', '9', 'u']

# Corpo-tronco: casca escura com veios e manchas, mais largo embaixo.
for y in range(12, 28):
    half = 7 + (y - 12) * 0.25
    for x in range(W):
        dx = x - 15.5
        if abs(dx) > half: continue
        side = (dx + half) / (2 * half) + (h(x, y, 2) - 0.5) * 0.25
        grain = h(x, y // 3, 7)
        c = '3' if side < 0.25 else '2' if side < 0.72 else '1'
        if grain > 0.8: c = '1' if c != '1' else '2'
        put(x, y, c)
# Manchas de musgo no corpo (como no Ancestral).
for cx, cy, r in [(9.5, 15, 2.2), (21.5, 16, 2), (10, 25, 1.8), (22, 26, 2.2), (15.5, 27, 1.5)]:
    for x, y in ell(cx, cy, r, r * 0.8):
        if get(x, y) in '123' and h(x, y, 9) > 0.25: put(x, y, '8' if h(x, y, 4) > 0.45 else 'x')

# Laje de pedra pontuda no peito (o núcleo de pedra do Ancestral), com musgo no topo.
for y in range(18, 27):
    w = min(y - 17, 27 - y) * 0.9 + 1.5
    for x in range(W):
        dx = x - 15.5
        if abs(dx) > w: continue
        k = (dx + w) / (2 * w)
        put(x, y, '6' if k < 0.35 else '5' if k < 0.75 else '4')
for x, y in [(15, 18), (16, 18), (14, 19), (16, 19), (17, 23), (13, 22)]:
    put(x, y, 'x' if (x + y) % 2 else '8')

# Rosto: sobrancelha de casca, olhos verdes brilhando, boca escura.
for x in range(9, 23): put(x, 13, '1')
for x in (10, 11, 20, 21): put(x, 12, '3')
for ex in (10, 19):
    for dx in range(3): put(ex + dx, 14, '0')
    put(ex, 15, '0'); put(ex + 1, 15, 'j'); put(ex + 2, 15, 'J')
    put(ex, 16, '0'); put(ex + 1, 16, 'J'); put(ex + 2, 16, '0')
for x in (14, 15, 16, 17): put(x, 17, '0')

# Braços de galho grossos terminando em garras de raiz (as mãos do Ancestral em miniatura).
for side in (-1, 1):
    sx = 15.5 + side * 7.6
    for t in range(0, 8):
        x = round(sx + side * t * 0.5); y = 15 + t
        put(x, y, '2'); put(x + side, y, '1'); put(x - side, y, '3')
    hx = round(sx + side * 4); hy = 23
    for dx in (-1, 0, 1):
        put(hx + dx, hy, '2'); put(hx + dx, hy + 1, '1')
    for fx in (-1, 0, 1):
        put(hx + fx * 1 + side * (fx == side), hy + 2, '1'); put(hx + fx * 2, hy + 3, '1')
    # Tufo de folhas no ombro.
    for x, y in ell(sx + side * 0.5, 14, 2.2, 1.6):
        put(x, y, '9' if h(x, y, 8) > 0.5 else '8')

# Copa: duas árvores (esquerda/direita) com uma ponta de pedra no meio, como o Ancestral.
for y in range(2, 12):
    w = (y - 2) * 0.55
    for x in range(W):
        dx = x - 15.5
        if abs(dx) > w: continue
        k = (dx + w) / (2 * w + 0.01)
        put(x, y, '6' if k < 0.4 else '5' if k < 0.8 else '4')
clumps = [(9, 7, 6, 4.6), (22.5, 7.5, 6, 4.6), (8, 10, 4, 2.5), (23.5, 10.5, 4, 2.5), (15.5, 11, 4, 1.6)]
for cx, cy, rx, ry in clumps:
    for x, y in ell(cx, cy, rx, ry):
        k = 1 - math.hypot((x - cx + rx * 0.4) / rx, (y - cy + ry * 0.45) / ry)
        v = k * 3.2 + (h(x, y, 1) - 0.5) * 1.8
        put(x, y, LEAF[max(0, min(3, int(v + 0.5)))])
for x, y in [(15, 3), (16, 4), (15, 6), (16, 8)]:
    put(x, y, 'x')
# Galhos saindo do corpo para as copas.
for x, y in [(11, 11), (12, 11), (20, 11), (19, 11), (10, 10), (21, 10)]:
    put(x, y, '1' if (x + y) % 2 else '2')
# Florzinhas rosas (de onde caem as pétalas no jogo).
for x, y in [(7, 5), (24, 6), (11, 8)]:
    put(x, y, 'q'); put(x + 1, y, 'Q'); put(x, y + 1, 'Q')

# Pernas-toco e raízes.
for lx in (10, 17):
    for y in range(27, 31):
        for x in range(lx, lx + 5):
            k = (x - lx) / 4
            put(x, y, '3' if k < 0.25 else '2' if k < 0.7 else '1')
for x, y in [(9, 30), (8, 31), (15, 30), (15, 31), (16, 30), (22, 30), (23, 31), (11, 31), (13, 31), (18, 31), (20, 31)]:
    put(x, y, '1')

# Contorno escuro.
filled = [[g[y][x] != '.' for x in range(W)] for y in range(H)]
for y in range(H):
    for x in range(W):
        if filled[y][x]: continue
        if any(0 <= x + dx < W and 0 <= y + dy < H and filled[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            g[y][x] = '0'

rows = [''.join(r) for r in g]
while rows and set(rows[0]) == {'.'}: rows.pop(0)
open(sys.argv[1], 'w').write('\n'.join(rows) + '\n')
print('\n'.join(rows))
