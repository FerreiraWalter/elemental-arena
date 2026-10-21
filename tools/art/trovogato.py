# Gera assets/monsters/cat_3.png (Trovogato):  python tools/art/trovogato.py assets/monsters/cat_3.png
# Pixel art desenhada a partir da referência docs/ref/trovogato-v2.png: gato siamês (pelo creme, máscara e patas
# marrom-escuras), olhos de raio, chapéu cônico dourado com faixa ornamentada, colete azul com bordas e bordados
# dourados sobre manto branco, faixa azul-marinho, avental com dois raios dourados, braçadeiras de metal, calça branca
# larga, faixas nas canelas e punhos com faíscas. Postura de luta, pernas abertas. A cauda é desenhada pelo jogo.
import sys
from PIL import Image

W, H = 40, 62
C = {
    'K': '#0f0b10',
    # chapéu
    'y': '#f2d478', 'Y': '#d8b050', 'H': '#a8803a', 'h': '#6a4c20', 't': '#1c4e5e', 'T': '#2a7286',
    # pelo siamês
    'c': '#e2d0b2', 'C': '#bfa888', 'q': '#94806a', 'D': '#2e211e', 'd': '#4e3a32', 'n': '#8a5a50',
    # olhos e raios
    'E': '#7ce8ff', 'e': '#ffffff', 'Z': '#3fa9ff',
    # manto
    'B': '#121a44', 'b': '#1c2a66', 'R': '#2a4290', 'r': '#3a5cb4', 's': '#5a7ad0',
    'G': '#d8b050', 'g': '#a8803a', 'o': '#f2d478',
    'P': '#f2f4f8', 'l': '#d2dae6', 'L': '#a4b0c4', 'M': '#7a869c',
    # metal
    'S': '#8a94a4', 'm': '#5a6272', 'x': '#3a404c',
}
px = [[None] * W for _ in range(H)]


def put(x, y, k):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H: px[y][x] = k


def ell(cx, cy, rx, ry, fn):
    for y in range(H):
        for x in range(W):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if nx * nx + ny * ny <= 1: put(x, y, fn(x, y, nx, ny))


def poly(pts, fn):
    for y in range(H):
        for x in range(W):
            X, Y = x + 0.5, y + 0.5
            ins = False
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[i - 1]
                if (y0 > Y) != (y1 > Y) and X < x0 + (Y - y0) * (x1 - x0) / (y1 - y0): ins = not ins
            if ins: put(x, y, fn(x, y))


def line(pts, k):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(int(n) + 1): put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, k)


# ── Pernas: calça branca larga, faixas azul-marinho nas canelas e patas escuras com garras ──
def pants(x, y):
    k = 'P' if (x < 13 or 21 < x < 25) else 'l'
    if (x + y) % 5 == 0 and y > 46: k = 'L'  # dobras
    if x in (10, 30) or y >= 52: k = 'L' if k != 'P' else 'l'
    return k
poly([(10, 43), (30, 43), (33, 49), (31, 53), (24, 53), (21, 48), (19, 48), (16, 53), (9, 53), (7, 49)], pants)
for x0 in (10, 25):
    for y in range(53, 57):
        for x in range(x0, x0 + 6): put(x, y, 'R' if y % 2 else 'b')
        put(x0, y, 'B')
ell(10.5, 58.3, 4.6, 2.3, lambda x, y, nx, ny: 'd' if ny < -0.2 and nx > -0.4 else 'D')
ell(29.5, 58.3, 4.6, 2.3, lambda x, y, nx, ny: 'd' if ny < -0.2 and nx < 0.4 else 'D')
for x in (7, 9, 11): put(x, 60, 'e')
for x in (29, 31, 33): put(x, 60, 'e')

# ── Mangas brancas bufantes, braçadeiras de metal e punhos ──
poly([(9, 22), (12, 25), (11, 32), (7, 36), (3, 34), (5, 26)], lambda x, y: 'P' if x < 7 else 'l' if x < 9 else 'L')
poly([(31, 22), (28, 25), (29, 32), (33, 36), (37, 34), (35, 26)], lambda x, y: 'l' if x < 31 else 'P' if x < 34 else 'L')
poly([(3, 34), (8, 36), (7, 41), (2, 40)], lambda x, y: 'S' if x < 5 else 'm')
poly([(37, 34), (32, 36), (33, 41), (38, 40)], lambda x, y: 'm' if x < 35 else 'S')
line([(3, 35), (7, 37)], 'G'); line([(37, 35), (33, 37)], 'G')
line([(2, 39), (7, 40)], 'x'); line([(38, 39), (33, 40)], 'x')
ell(4.5, 42.5, 2.6, 2.2, lambda x, y, nx, ny: 'd' if nx < 0 and ny < 0 else 'D')
ell(35.5, 42.5, 2.6, 2.2, lambda x, y, nx, ny: 'd' if nx > 0 and ny < 0 else 'D')

# ── Tronco: colete azul com bordas douradas sobre manto branco ──
def vest(x, y):
    k = 'b' if x < 15 else 'R' if x < 26 else 'r'
    if (x * 3 + y * 5) % 11 == 0 and 12 < x < 28: k = 'b' if k == 'R' else 'R'
    return k
poly([(9, 22), (31, 22), (32, 26), (29, 35), (11, 35), (8, 26)], vest)
# Ombreiras arredondadas com borda dourada.
ell(10, 24.2, 3.8, 2.6, lambda x, y, nx, ny: 'G' if ny > 0.55 else 'b' if nx < 0 else 'R')
ell(30, 24.2, 3.8, 2.6, lambda x, y, nx, ny: 'G' if ny > 0.55 else 'R' if nx < 0 else 'r')
# Abertura em V: manto branco por dentro, gola azul-marinho cruzada e bordas douradas do colete.
for i in range(10):
    y = 21 + i
    w = max(0, 4 - i * 0.45)
    for x in range(round(20 - w), round(20 + w) + 1): put(x, y, 'P' if x < 20 else 'l')
    put(round(20 - w) - 1, y, 'B'); put(round(20 + w) + 1, y, 'B')
    put(round(20 - w) - 2, y, 'G'); put(round(20 + w) + 2, y, 'G')
line([(17, 21), (22, 27)], 'B')  # gola cruzando
# Bordados dourados (dragões) nos dois lados do peito.
for x, y in [(12, 27), (13, 26), (14, 27), (13, 28), (12, 29), (14, 29), (26, 27), (27, 26), (28, 27), (27, 28), (26, 29), (28, 29)]:
    put(x, y, 'G' if (x + y) % 2 else 'o')
# Faixa azul-marinho na cintura com nó dourado.
for x in range(10, 31):
    for y in (33, 34, 35): put(x, y, 'B' if y == 35 or x in (10, 30) else 'b' if (x + y) % 3 else 'R')
for x, y in [(20, 33), (19, 34), (21, 34), (20, 35), (20, 34)]: put(x, y, 'G')
put(20, 34, 'o')
# Avental frontal com borda dourada e dois raios.
poly([(14, 36), (26, 36), (25, 47), (15, 47)], lambda x, y: 'R' if 16 < x < 24 else 'b')
line([(14, 36), (15, 47), (25, 47), (26, 36)], 'G')
for bx in (17, 22):
    for x, y in [(bx + 1, 37), (bx, 38), (bx, 39), (bx + 1, 40), (bx + 1, 41), (bx, 42), (bx, 43), (bx + 1, 44), (bx + 1, 45)]: put(x, y, 'o')
    put(bx, 40, 'G'); put(bx + 1, 43, 'G')

# ── Cabeça: siamês, máscara escura, olhos de raio ──
ell(20, 16.2, 7.8, 5.6, lambda x, y, nx, ny: 'C' if nx < -0.55 else 'q' if ny < -0.7 else 'c')
for x, y in [(11, 17), (11, 18), (12, 19), (29, 17), (29, 18), (28, 19)]: put(x, y, 'c')  # tufos das bochechas
ell(20, 17.8, 4.2, 3.2, lambda x, y, nx, ny: 'd' if nx * nx + ny * ny > 0.5 else 'D')
for x in range(17, 24): put(x, 13, 'q')  # sombra da aba
# Olhos puxados e brilhantes, com sobrancelha franzida.
for ex, d in ((16, 1), (24, -1)):
    put(ex, 15, 'E'); put(ex + d, 15, 'e'); put(ex - d, 15, 'Z'); put(ex, 16, 'Z')
    put(ex - d, 14, 'D'); put(ex, 14, 'K'); put(ex + d, 14, 'K')
put(20, 18, 'n'); put(19, 19, 'q'); put(21, 19, 'q')
for x, y in [(13, 18), (12, 19), (27, 18), (28, 19)]: put(x, y, 'l')  # bigodes
for x in range(17, 24): put(x, 21, 'c' if 18 < x < 22 else 'C')  # pescoço

# ── Chapéu cônico dourado com faixa ornamentada e orelhas atravessando ──
def straw(x, y):
    k = 'Y' if y % 2 == 0 else 'H'
    if x < 15: k = 'y' if y % 2 == 0 else 'Y'
    if x > 26: k = 'H' if y % 2 == 0 else 'h'
    return k
poly([(20, 0.5), (32, 8.5), (8, 8.5)], straw)
for x in range(3, 37):
    put(x, 9, 'y' if x < 14 else 'Y' if x < 27 else 'H')
    put(x, 10, 'H' if 4 < x < 35 else 'h')
for x in range(6, 34): put(x, 11, 'h')
for x in range(10, 31):
    if px[6][x] is not None: put(x, 6, 't'); put(x, 7, 't' if x % 3 else 'T')
for x in range(11, 30, 3): put(x, 6, 'G')
put(20, 6, 'E'); put(20, 7, 'Z'); put(19, 6, 'G'); put(21, 6, 'G')
# Orelhas marrom-escuras saindo pelos lados do cone.
# Orelhas marrom-escuras furando a palha perto do topo, apontando para cima.
for ox, d in ((14, 1), (26, -1)):
    for i in range(5):  # i = altura acima da palha
        w = 3 - i * 0.6
        for j in range(int(round(w)) + 1):
            x = ox + d * j
            put(x, 4 - i, 'D' if j == 0 or j >= round(w) else 'n')

# ── Faíscas nas mãos (pixels "glow" cintilam no jogo) ──
for x, y in [(1, 42), (2, 44), (6, 45), (1, 40), (7, 43)]: put(x, y, 'E')
put(2, 41, 'e')
for x, y in [(39, 41), (38, 44), (34, 45), (39, 39), (37, 46), (33, 44), (38, 42)]: put(x, y, 'E')
put(38, 40, 'e'); put(39, 43, 'Z'); put(36, 45, 'Z')

# Contorno escuro automático (4 vizinhos), sem contornar as faíscas.
GLOW = ('E', 'e', 'Z')
out = [row[:] for row in px]
for y in range(H):
    for x in range(W):
        if px[y][x] is None and any(0 <= x + dx < W and 0 <= y + dy < H and px[y + dy][x + dx] not in (None, 'K') + GLOW
                                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            out[y][x] = 'K'
im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for y in range(H):
    for x in range(W):
        k = out[y][x]
        if k: im.putpixel((x, y), tuple(int(C[k][i:i + 2], 16) for i in (1, 3, 5)) + (255,))
im.save(sys.argv[1] if len(sys.argv) > 1 else 'cat_3.png')
