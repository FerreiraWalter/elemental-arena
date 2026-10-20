"""Redesenha as pernas do Trovogato (assets/monsters/cat_3.png): tira os restos escuros da cauda do recorte (a cauda
agora é desenhada pelo jogo) e põe duas pernas retas — calça branca, faixas azul-marinho e patas escuras com garras.
Uso: python tools/fix_trovogato_legs.py   (roda sobre o PNG gerado por tools/extract_cats_ref.py)"""
from pathlib import Path
from PIL import Image

PNG = Path(__file__).resolve().parent.parent / 'assets' / 'monsters' / 'cat_3.png'
C = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
OUT = C('#0f0b10')
WHITE = [C('#eef1f6'), C('#dfe5ef'), C('#c3cddd'), C('#97a3ba')]
NAVY = [C('#33509e'), C('#24387e'), C('#18245a')]
FUR = [C('#5a4c4f'), C('#3f3538'), C('#2a2326')]
CLAW = C('#eef1f6')

im = Image.open(PNG).convert('RGBA')
W, H = im.size
px = im.load()
lum = lambda p: 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]

HEM = 46          # última linha da barra do quimono/calça
# 1) Restos escuros da cauda nas laterais (fora do corpo) e tudo abaixo da barra.
for y in range(30, H):
    for x in range(W):
        p = px[x, y]
        if p[3] == 0:
            continue
        side = x >= 27 or x <= 4
        if y > HEM or (side and y >= 37 and lum(p) < 70):
            px[x, y] = (0, 0, 0, 0)

# 2) Pernas retas.
def leg(x0):
    for y in range(HEM + 1, H - 1):
        for dx in range(5):
            x = x0 + dx
            if y <= HEM + 5:                       # calça branca, luz da esquerda
                c = WHITE[min(3, dx)] if dx < 4 else WHITE[3]
            elif y <= HEM + 10:                    # faixas azul-marinho
                c = NAVY[(y + dx // 2) % 2 + (1 if dx >= 3 else 0)]
            else:                                  # pata escura, um pouco mais larga
                c = FUR[min(2, dx // 2)]
            px[x, y] = c
    # pata: alarga 1 px para os lados nas duas últimas linhas, garras na ponta
    for y in (H - 3, H - 2):
        px[x0 - 1, y] = FUR[1]; px[x0 + 5, y] = FUR[2]
    for gx in (x0, x0 + 2, x0 + 4):
        px[gx, H - 2] = CLAW

leg(8)
leg(20)

# 3) Contorno escuro de 1 px nas linhas mexidas.
solid = {(x, y) for y in range(H) for x in range(W) if px[x, y][3] > 0}
for y in range(34, H):
    for x in range(W):
        if (x, y) in solid:
            continue
        if any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OUT
im.save(PNG)
print('ok', im.size)
