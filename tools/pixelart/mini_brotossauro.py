"""Brotossauro (forma base) como FILHOTE do Brotossauro Ancestral: parte da própria arte da evolução
(assets/monsters/plant_3.png), em proporção de filhote (copa/corpo menores, pernas de raiz bem curtas) e REPINTADO como
pixel art limpa: cada pixel vira um material (folha, casca, pedra) com rampa de cor própria (sombra fria, luz quente),
luz vinda do alto à esquerda nas bordas, sem pixels soltos, contorno quente e olhos ocos (nós de madeira).
Uso: python tools/pixelart/mini_brotossauro.py   (gera assets/monsters/plant_1.png)"""
from pathlib import Path
from PIL import Image
import colorsys
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / 'assets' / 'monsters' / 'plant_3.png'
OUT = ROOT / 'assets' / 'monsters' / 'plant_1.png'

TOP_END = 35          # linha da arte grande onde começam as pernas de raiz
W_OUT = 33            # largura final
LEG_H = 9             # altura final das pernas (bem curtas: filhote)

hx = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
# Rampas do escuro ao claro, com a sombra puxando para o frio e a luz para o quente.
RAMP = {
    1: [hx(c) for c in ('#16302a', '#22452f', '#33602f', '#4c7c33', '#6c9a3c', '#97bd52')],   # folha
    2: [hx(c) for c in ('#24171a', '#3b241e', '#553424', '#71492d', '#8f6238', '#ad7f4a')],   # casca
    3: [hx(c) for c in ('#33363b', '#4a4f51', '#646a63', '#82887a', '#a3a792')],              # pedra
}
OUTLINE = hx('#140e0f')
HOLE = hx('#070405')


def shrink(img, w, h):
    """Reduz com média (premultiplicada); alfa vira 0/255."""
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
img = Image.new('RGBA', (W_OUT, top.height + legs.height))
img.alpha_composite(legs, (0, top.height - 1))
img.alpha_composite(top, (0, 0))
A = np.asarray(img).astype(np.float32)
H, W = A.shape[:2]
on = A[..., 3] > 0

# 1) Material de cada pixel pela cor: folha (verde), casca (marrom), pedra (cinza); muito escuro = decide pelos vizinhos.
mat = np.zeros((H, W), np.int8)
val = np.zeros((H, W), np.float32)
for y in range(H):
    for x in range(W):
        if not on[y, x]:
            continue
        r, g, b = A[y, x, :3] / 255.0
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        val[y, x] = 0.3 * r + 0.59 * g + 0.11 * b
        if v < 0.11:
            mat[y, x] = -1
        elif s < 0.16:
            mat[y, x] = 3
        elif 0.13 <= h <= 0.47:  # inclui o musgo amarelado do corpo
            mat[y, x] = 1
        else:
            mat[y, x] = 2


def majority(m, keep_unknown=False):
    out = m.copy()
    for y in range(H):
        for x in range(W):
            if not on[y, x]:
                continue
            cnt = {}
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and on[yy, xx] and m[yy, xx] > 0:
                        cnt[m[yy, xx]] = cnt.get(m[yy, xx], 0) + (2 if dx == 0 and dy == 0 else 1)
            if cnt:
                out[y, x] = max(cnt, key=cnt.get)
    return out


mat = majority(majority(mat))   # tira o granulado: manchas de material maiores
mat[(mat <= 0) & on] = 2        # o que sobrou escuro vira casca na sombra
# Pedra em fiapo (menos de 3 vizinhos de pedra) vira casca: senão sobram riscos cinza parecendo rachadura.
st = mat.copy()
for y in range(H):
    for x in range(W):
        if st[y, x] == 3 and sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and 0 <= y + dy < H and 0 <= x + dx < W and st[y + dy, x + dx] == 3) < 3:
            mat[y, x] = 2

# 2) Tom: brilho suavizado (3×3), normalizado por material, + luz do alto à esquerda nas bordas.
blur = val.copy()
for y in range(H):
    for x in range(W):
        if not on[y, x]:
            continue
        acc = n = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and on[yy, xx]:
                    acc += val[yy, xx]; n += 1
        blur[y, x] = acc / n
out = np.zeros((H, W, 4), np.uint8)
idx = np.zeros((H, W), np.int8)
for mt, ramp in RAMP.items():
    sel = (mat == mt) & on
    if not sel.any():
        continue
    lo, hi = np.percentile(blur[sel], 5), np.percentile(blur[sel], 95)
    for y, x in zip(*np.nonzero(sel)):
        t = (blur[y, x] - lo) / max(1e-3, hi - lo)
        # Borda iluminada (vazio ou outro material em cima/à esquerda) e borda na sombra (embaixo/à direita).
        def other(yy, xx):
            return not (0 <= yy < H and 0 <= xx < W) or not on[yy, xx] or mat[yy, xx] != mt
        if other(y - 1, x) or other(y, x - 1) or other(y - 1, x - 1):
            t += 0.32
        if other(y + 1, x) or other(y, x + 1):
            t -= 0.28
        i = int(np.clip(round(t * (len(ramp) - 1) * 0.85 + 0.6), 0, len(ramp) - 1))
        idx[y, x] = i
        out[y, x] = ramp[i]

# 3) Sem pixel solto: se os 4 vizinhos concordam numa cor diferente, ele vira essa cor.
for _ in range(2):
    ref = out.copy()
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not on[y, x]:
                continue
            nb = [tuple(ref[y + dy, x + dx]) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if on[y + dy, x + dx]]
            me = tuple(ref[y, x])
            if len(nb) == 4 and me not in nb:
                best = max(set(nb), key=nb.count)
                if nb.count(best) >= 3:
                    out[y, x] = best

img = Image.fromarray(out.copy(), 'RGBA').copy()
px = img.load()


def put(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        px[x, y] = c


# 4) Rosto no tronco: placa de casca lisa com veios, olhos OCOS (nós de madeira pretos) e boca oca.
BK = RAMP[2]
cx, ey = W // 2, round(top.height * 0.62)
for y in range(ey - 4, ey + 6):
    for x in range(cx - 7, cx + 7):
        d = ((x + 0.5 - cx) / 6.6) ** 2 + ((y - ey - 0.3) / 4.8) ** 2
        if d > 1:
            continue
        c = BK[4] if y < ey - 1 else BK[3] if y < ey + 3 else BK[2]
        if x < cx - 4 and y < ey + 1:
            c = BK[5] if y < ey - 1 else BK[4]                 # luz do alto à esquerda
        if d > 0.8:
            c = BK[1] if (x > cx or y > ey + 2) else BK[2]      # borda da placa
        if (x - cx) % 4 == 2 and y > ey + 2 and d < 0.8:
            c = BK[2]                                           # veios embaixo
        put(x, y, c)
for ex in (cx - 4, cx + 2):
    # nó de madeira: borda escura, buraco preto, beirada de baixo pegando luz
    for dx in (-1, 2):
        for dy in range(3):
            put(ex + dx, ey - 1 + dy, BK[1])
    for dx in range(2):
        put(ex + dx, ey - 2, BK[1])
        for dy in range(3):
            put(ex + dx, ey - 1 + dy, HOLE)
        put(ex + dx, ey + 2, BK[4])
for x in range(cx - 1, cx + 1):          # boca: buraco pequeno com lábio de casca
    put(x, ey + 3, HOLE)
    put(x, ey + 4, BK[4])
put(cx - 2, ey + 3, BK[1]); put(cx + 1, ey + 3, BK[1])

# Furinhos de 1 px no meio do corpo (3+ vizinhos opacos) viram casca na sombra.
for y in range(1, H - 1):
    for x in range(1, W - 1):
        if px[x, y][3] == 0 and sum(px[x + dx, y + dy][3] > 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) >= 3:
            px[x, y] = BK[1]

# 5) Contorno quente de 1 px.
solid = {(x, y) for y in range(H) for x in range(W) if px[x, y][3] > 0}
canvas = Image.new('RGBA', (W + 2, H + 1))
canvas.alpha_composite(img, (1, 0))
cp = canvas.load()
for y in range(H + 1):
    for x in range(W + 2):
        if cp[x, y][3] > 0:
            continue
        if any((x - 1 + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            cp[x, y] = OUTLINE
bbox = canvas.getbbox()
canvas.crop(bbox).save(OUT)
print('plant_1', canvas.crop(bbox).size)
