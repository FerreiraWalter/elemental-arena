# Gera assets/monsters/cat_3.png (Trovogato):  python tools/art/trovogato.py assets/monsters/cat_3.png
# Trovogato redesenhado: gato-monge do trovão, de frente, chapéu de palha, manto azul com acabamentos claros e raios.
import sys, math
from PIL import Image
W, H = 34, 60
C = {
 'K': '#0f0b10', 'h': '#5e3f16', 'H': '#94702c', 'Y': '#c89f48', 'y': '#ecc874',
 'F': '#211b1e', 'f': '#3f3538', 'g': '#5a4c4f', 'G': '#786669', 'W': '#dcd0c0', 'w': '#f2eee8', 'n': '#c87a8a',
 'E': '#7ce8ff', 'e': '#ffffff',
 'B': '#0f1532', 'b': '#18245a', 'R': '#24387e', 'r': '#33509e', 's': '#4a6cc0',
 'L': '#97a3ba', 'l': '#c3cddd', 'P': '#dfe5ef', 'C': '#7ce8ff', 'c': '#3fa9ff',
}
px = [[None] * W for _ in range(H)]
def put(x, y, k):
    if 0 <= x < W and 0 <= y < H: px[y][x] = k
def ell(cx, cy, rx, ry, fn):
    for y in range(H):
        for x in range(W):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if nx * nx + ny * ny <= 1: put(x, y, fn(x, y, nx, ny))
def poly(pts, fn):
    for y in range(H):
        for x in range(W):
            X, Y = x + 0.5, y + 0.5; ins = False
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[i - 1]
                if (y0 > Y) != (y1 > Y) and X < x0 + (Y - y0) * (x1 - x0) / (y1 - y0): ins = not ins
            if ins: put(x, y, fn(x, y))

# Cauda (atrás do manto): sobe pela esquerda e termina em ponta de raio.
tail = [(6, 49), (4, 48), (3, 47), (2, 46), (1, 44), (1, 43)]
for x, y in tail:
    put(x, y, 'f'); put(x + 1, y, 'F'); put(x, y + 1, 'F')
for x, y in [(1, 42), (2, 41), (1, 40), (2, 39)]: put(x, y, 'C')
put(2, 42, 'c'); put(1, 41, 'e')

# Pernas com faixas brancas e azuis; patas escuras com dedos claros.
for lx in (10, 19):
    for y in range(49, 57):
        for x in range(lx, lx + 5):
            k = 'P' if x < lx + 3 else 'l'
            if y in (51, 54): k = 'r' if x < lx + 3 else 'R'
            put(x, y, k)
    for x in range(lx - 1, lx + 6):
        for y in (57, 58): put(x, y, 'F' if y == 58 or x in (lx - 1, lx + 5) else 'f')
    for x in (lx, lx + 2, lx + 4): put(x, 58, 'W')

# Manto: trapézio que alarga até a barra. Sombra à esquerda, luz à direita.
def robe(x, y):
    t = (x - 5) / 24
    k = 'b' if t < 0.25 else 'R' if t < 0.7 else 'r'
    if (x + y) % 7 == 0 and 0.3 < t < 0.65: k = 'R'
    return k
poly([(8, 20), (26, 20), (29, 50), (5, 50)], robe)
# Barra com acabamento claro e zigue-zague de raio.
for x in range(5, 29):
    put(x, 48, 'L'); put(x, 49, 'P' if x % 2 else 'l')
    put(x, 47, 'C' if (x % 4 in (0, 1)) and x % 8 < 4 else ('C' if x % 8 in (5, 6) and False else px[47][x]))
for x in range(6, 28, 4): put(x, 46, 'C'); put(x + 1, 47, 'C'); put(x + 2, 46, 'C')
# Abertura central (abaixo da faixa) com bordas claras.
for y in range(36, 48):
    put(16, y, 'P'); put(17, y, 'B'); put(18, y, 'l')
# Gola em V: pelo do peito aparece no meio, bordas brancas dos dois lados.
for i in range(13):
    y = 20 + i
    w = max(0, 5 - i // 2)
    for x in range(17 - w, 17 + w + 1): put(x, y, ('W' if i < 5 else 'G') if abs(x - 17) < w - 1 else 'g')
    put(17 - w - 1, y, 'P'); put(17 - w - 2, y, 'l'); put(17 + w + 1, y, 'P'); put(17 + w + 2, y, 'L')
# Faixa na cintura com fivela de raio.
for x in range(7, 28):
    for y in (33, 34, 35): put(x, y, 'L' if y == 33 else 'l' if y == 34 else 'L')
for x, y in [(18, 32), (17, 33), (16, 34), (18, 34), (17, 35), (16, 36)]: put(x, y, 'C')
put(17, 34, 'e')
# Mangas largas com punhos claros; patinhas aparecendo, faíscas na pata direita.
poly([(8, 21), (3, 30), (2, 38), (8, 38), (10, 26)], lambda x, y: 'b' if x < 5 else 'R')
poly([(26, 21), (31, 30), (32, 38), (26, 38), (24, 26)], lambda x, y: 's' if x > 29 else 'r')
for x in range(2, 9): put(x, 37, 'l'); put(x, 38, 'P')
for x in range(26, 33): put(x, 37, 'l'); put(x, 38, 'P')
for x in range(3, 8): put(x, 39, 'g' if x % 2 else 'G')
for x in range(27, 32): put(x, 39, 'g' if x % 2 else 'G')
for x, y in [(33, 40), (32, 41), (33, 42), (30, 41), (29, 42), (31, 43)]: put(x, y, 'C')
put(32, 42, 'e')
# Raio bordado no peito do manto (lado direito).
for x, y in [(23, 25), (22, 26), (23, 27), (22, 28), (21, 29), (22, 30)]: put(x, y, 'c')

# Cabeça: pelo escuro, bochechas, focinho branco, olhos de raio.
ell(17, 15.5, 7.6, 6.2, lambda x, y, nx, ny: 'g' if nx > 0.35 and ny < 0.1 else 'F' if nx < -0.5 else 'f')
for x, y in [(9, 16), (9, 17), (10, 18), (25, 16), (25, 17), (24, 18)]: put(x, y, 'f')  # tufos da bochecha
ell(17, 18.4, 3.7, 2.4, lambda x, y, nx, ny: 'w' if ny < 0 else 'W')
put(17, 17, 'n'); put(16, 19, 'G'); put(18, 19, 'G')
for x, y in [(11, 18), (10, 19), (12, 19), (23, 18), (24, 19), (22, 19)]: put(x, y, 'L')  # bigodes
for ex in (13, 20):
    put(ex, 15, 'E'); put(ex + 1, 15, 'e'); put(ex, 14, 'K'); put(ex + 1, 14, 'K'); put(ex - 1, 15, 'K'); put(ex + 2, 15, 'K')
    put(ex, 16, 'c'); put(ex + 1, 16, 'E')
# Orelhas saindo por baixo da aba.

# Chapéu de palha cônico com fita azul e para-raios na ponta.
def straw(x, y):
    k = 'Y' if (y % 2 == 0) else 'H'
    if x < 12 and y < 7: k = 'y' if y % 2 == 0 else 'Y'
    if x > 22: k = 'H' if y % 2 == 0 else 'h'
    return k
poly([(17, 0.5), (29, 8), (5, 8)], straw)
for x in range(1, 33):
    put(x, 8, 'y' if x < 12 else 'Y' if x < 24 else 'H')
    put(x, 9, 'H' if 3 < x < 30 else 'h')
for x in range(3, 31): put(x, 10, 'h') if px[10][x] is None or 8 < x < 26 else None
for x in range(8, 27): put(x, 7, 'R' if x % 3 else 'r')  # fita
for x in (12, 21): put(x, 7, 'C')
put(17, 0, 'K'); put(17, 1, 'H')
# Orelha atravessando a palha (como no Raiolua), com brinco de raio.
for i in range(6):
    for j in range(i + 1):
        put(8 + j, 1 + i, 'f' if j == 0 else 'g' if j == i else ('n' if i > 2 and j < i - 1 else 'G'))
put(8, 7, 'C'); put(8, 8, 'e')

# Contorno escuro automático (4 vizinhos).
out = [row[:] for row in px]
for y in range(H):
    for x in range(W):
        if px[y][x] is None and any(0 <= x + dx < W and 0 <= y + dy < H and px[y + dy][x + dx] not in (None, 'K') and px[y + dy][x + dx] not in ('C', 'c', 'e') for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            out[y][x] = 'K'
im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for y in range(H):
    for x in range(W):
        k = out[y][x]
        if k: im.putpixel((x, y), tuple(int(C[k][i:i + 2], 16) for i in (1, 3, 5)) + (255,))
im.save(sys.argv[1])
