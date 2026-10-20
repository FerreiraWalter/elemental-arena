"""Extrai Pugilar e Lutapacho da imagem de referência (cena com fundo de floresta, não fundo liso).

Os dois são todos em tons quentes (marrom, bege, couraça de pedra marrom) e o fundo é verde/cinza:
máscara de pixels quentes -> maior região conectada -> preenche furos (olhos, dentes) -> recorte ->
reduz para a densidade de pixels do jogo -> paleta limitada -> contorno de 1 px (as funções de
extract_sprites.py, as mesmas dos outros 12 monstros).

Uso: python tools/extract_brawlers.py CAMINHO_DA_IMAGEM   (gera assets/monsters/brawler_1.png e brawler_3.png)
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sprites import downscale, quantize, outline, bbox_alpha  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'monsters'
# Recortes na imagem de referência (sem os nomes escritos embaixo) e altura final no jogo.
JOBS = [
    ('brawler_1', (18, 32, 150, 172), 38, []),  # Pugilar
    # Lutapacho: na região acima do ombro direito há folhas amareladas no fundo; ali a regra de cor é mais rígida.
    ('brawler_3', (168, 30, 332, 176), 50, [(314, 30, 332, 74)]),
]


def warm(c):
    r, g, b = c[0], c[1], c[2]
    # Tons quentes (pele, couro, couraça marrom, contorno marrom-escuro); o fundo é verde ou cinza.
    if r >= g + 6 and r - b >= 22:
        return True
    # Garras e dentes claros (bege/branco): claros e sem puxar para o verde da chuva e da grama.
    return min(r, g, b) > 150 and g <= r + 4 and r - b < 70


def extract(im, box, skip=()):
    crop = im.crop(box).convert('RGBA')
    w, h = crop.size
    px = crop.load()
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            ax, ay = x + box[0], y + box[1]
            c = px[x, y]
            strict = any(x0 <= ax < x1 and y0 <= ay < y1 for x0, y0, x1, y1 in skip)
            # Na zona das folhas (amarelo-oliva), só entra o que é claramente marrom (vermelho bem acima do verde).
            if warm(c) and (not strict or c[0] - c[1] >= 18):
                mask[y * w + x] = 1
    # Maior região conectada (o personagem); descarta folhas e manchas soltas do fundo.
    seen = bytearray(w * h)
    comps = []
    for s in range(w * h):
        if not mask[s] or seen[s]:
            continue
        comp, q = [], deque([s])
        seen[s] = 1
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        comps.append(comp)
    # O personagem = maior região + partes grandes separadas por pouco (punho, garras); descarta manchas do fundo.
    comps.sort(key=len, reverse=True)
    keep = bytearray(w * h)
    for comp in comps:
        if comp is comps[0] or len(comp) >= max(60, len(comps[0]) * 0.03):
            for i in comp:
                keep[i] = 1
    # Furos internos (olho branco, garras claras cercadas): o que não alcança a borda pelo fundo vira personagem.
    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not keep[y * w + x]:
                q.append(y * w + x)
                outside[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if not keep[y * w + x] and not outside[y * w + x]:
                q.append(y * w + x)
                outside[y * w + x] = 1
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not keep[j] and not outside[j]:
                    outside[j] = 1
                    q.append(j)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not outside[y * w + x]:
                c = px[x, y]
                op[x, y] = (c[0], c[1], c[2], 255)
    b = bbox_alpha(out)
    return out.crop(b)


def main():
    src = Path(sys.argv[1])
    im = Image.open(src).convert('RGBA')
    for name, box, target_h, skip in JOBS:
        spr = extract(im, box, skip)
        spr = downscale(spr, target_h)
        spr = quantize(spr, 24)
        spr = outline(spr)
        spr.save(OUT / f'{name}.png')
        print(name, spr.size)


if __name__ == '__main__':
    main()
