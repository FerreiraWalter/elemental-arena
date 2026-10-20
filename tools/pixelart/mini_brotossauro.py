"""Brotossauro (forma base) como FILHOTE do Brotossauro Ancestral: parte da própria arte da evolução
(assets/monsters/plant_3.png), em proporção de filhote (copa/corpo menores, pernas de raiz bem curtas), cores um pouco
mais claras e vivas como os outros monstros de estágio 1, olhinhos brilhando no tronco e flores na copa.
Uso: python tools/pixelart/mini_brotossauro.py   (gera assets/monsters/plant_1.png)"""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / 'assets' / 'monsters' / 'plant_3.png'
OUT = ROOT / 'assets' / 'monsters' / 'plant_1.png'

TOP_END = 35          # linha da arte grande onde começam as pernas de raiz
W_OUT = 33            # largura final
LEG_H = 9             # altura final das pernas (bem curtas: filhote)
OUTLINE = (18, 11, 21, 255)


def shrink(img, w, h):
    """Reduz com média (premultiplicada), sem borrar o contorno: alfa vira 0/255."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3] * (a[..., 3:] / 255.0), a[..., 3:]
    pm = Image.fromarray(np.concatenate([rgb, al], -1).astype(np.uint8), 'RGBA').resize((w, h), Image.BOX)
    b = np.asarray(pm).astype(np.float32)
    al = b[..., 3:]
    rgb = np.where(al > 0, b[..., :3] / np.maximum(al, 1) * 255.0, 0)
    out = np.concatenate([np.clip(rgb, 0, 255), np.where(al > 110, 255, 0)], -1).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


src = Image.open(SRC).convert('RGBA')
sw, sh = src.size
k = W_OUT / sw
top = shrink(src.crop((0, 0, sw, TOP_END)), W_OUT, round(TOP_END * k))
legs = shrink(src.crop((0, TOP_END, sw, sh)), W_OUT, LEG_H)
H = top.height + legs.height
img = Image.new('RGBA', (W_OUT, H + 1))
img.alpha_composite(legs, (0, top.height - 1))
img.alpha_composite(top, (0, 0))

# Mais claro e mais vivo (os estágios 1 são mais coloridos que a evolução, que é escura e musgosa).
rgb = img.convert('RGB')
rgb = ImageEnhance.Brightness(rgb).enhance(1.38)
rgb = ImageEnhance.Color(rgb).enhance(1.35)
rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
rgb = rgb.filter(ImageFilter.MedianFilter(3))  # tira o granulado da redução: manchas maiores, como os outros sprites
img = Image.merge('RGBA', (*rgb.split(), img.split()[3]))

# Paleta curta (pixel art limpa): quantiza só os pixels opacos.
alpha = np.asarray(img)[..., 3]
q = img.convert('RGB').quantize(colors=12, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
img = Image.merge('RGBA', (*q.split(), Image.fromarray(alpha)))
px = img.load()
W, Hh = img.size

def put(x, y, c):
    if 0 <= x < W and 0 <= y < Hh:
        px[x, y] = c

# Rosto no tronco: placa de casca clara (lê bem no meio do musgo), olhos amarelos brilhando e sorriso.
cx, ey = W // 2, round(top.height * 0.62)
for y in range(ey - 3, ey + 5):
    for x in range(cx - 7, cx + 7):
        d = ((x + 0.5 - cx) / 6.6) ** 2 + ((y - ey - 0.5) / 4.2) ** 2
        if d <= 1:
            put(x, y, (154, 108, 74, 255) if y < ey + 2 else (122, 82, 56, 255))
            if d > 0.78: put(x, y, (92, 60, 40, 255))
for ex in (cx - 5, cx + 1):
    for dx in range(4):
        put(ex + dx, ey - 2, (58, 36, 26, 255))            # sobrancelha de casca
    for dy in range(3):
        for dx in range(4):
            put(ex + dx, ey - 1 + dy, (20, 12, 14, 255))   # órbita escura
    # Amarelo-claro (não verde): pixel verde é tratado como folhagem pelo animador e balança — o olho "escorregava".
    # (com azul >= 130 para não cair na regra de chama, que faz o pixel tremular em laranja)
    put(ex + 1, ey, (255, 250, 205, 255)); put(ex + 2, ey, (252, 230, 150, 255))
    put(ex + 1, ey + 1, (236, 206, 140, 255)); put(ex + 2, ey + 1, (210, 170, 132, 255))
for x in range(cx - 1, cx + 1):
    put(x, ey + 3, (40, 22, 18, 255))
put(cx - 2, ey + 2, (40, 22, 18, 255)); put(cx + 1, ey + 2, (40, 22, 18, 255))

# Flores rosas na copa (as pétalas do jogo caem daqui).
for fx, fy in [(6, 4), (W - 9, 3), (cx, 2), (4, 11), (W - 6, 10)]:
    if px[fx, fy][3] == 0:
        continue
    put(fx, fy, (255, 196, 222, 255)); put(fx + 1, fy, (232, 111, 156, 255)); put(fx, fy + 1, (232, 111, 156, 255))
    put(fx - 1, fy, (232, 111, 156, 255)); put(fx, fy - 1, (232, 111, 156, 255))

# Contorno escuro de 1 px (como os outros sprites).
solid = {(x, y) for y in range(Hh) for x in range(W) if px[x, y][3] > 0}
canvas = Image.new('RGBA', (W + 2, Hh + 1))
canvas.alpha_composite(img, (1, 0))
cp = canvas.load()
for y in range(Hh + 1):
    for x in range(W + 2):
        if cp[x, y][3] > 0:
            continue
        if any((x - 1 + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            cp[x, y] = OUTLINE
bbox = canvas.getbbox()
canvas.crop(bbox).save(OUT)
print('plant_1', canvas.crop(bbox).size)
