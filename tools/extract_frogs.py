"""Recorta os sapos psíquicos (Sapomental e Sapofilósofo) da arte de referência e gera os sprites.
Fundo escuro e uniforme: a máscara é "pixel claro o bastante", e fica só o pedaço CONECTADO ao centro do sapo
(as esferas e espirais soltas em volta viram efeitos do jogo, não parte do sprite).
Uso: python tools/extract_frogs.py <imagem de referência>   (gera assets/monsters/frog_1.png e frog_3.png)"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sprites import downscale, outline  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'monsters'
# nome, caixa (x0, y0, x1, y1) na imagem de referência, ponto no meio do corpo, altura final (px)
JOBS = [
    ('frog_1', (95, 128, 360, 362), (225, 270), 38, []),
    ('frog_3', (630, 115, 945, 375), (780, 270), 54, [(700, 142, 19)]),  # esfera grudada na mão de cima
]


def cut(img, box, seed, erase=()):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    lum = sub @ np.array([0.3, 0.59, 0.11])
    sat = sub.max(-1) - sub.min(-1)
    mask = (((lum > 46) | (sat > 60)) * 255).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=2)
    for ex, ey, er in erase:
        cv2.circle(mask, (ex - x0, ey - y0), er, 0, -1)
    _, lab = cv2.connectedComponents(mask)
    keep = (lab == lab[seed[1] - y0, seed[0] - x0]).astype(np.uint8) * 255
    # tapa buracos: tudo que não é alcançável a partir da borda vira corpo
    ff = keep.copy(); h, w = ff.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    keep = keep | cv2.bitwise_not(ff)
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, k3, iterations=1) > 0
    rgba = np.dstack([sub, keep * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im.crop(im.getbbox())


def snap(sprite, n=22):
    """Paleta curta (pixel art limpa) só nos pixels opacos."""
    al = sprite.getchannel('A')
    q = sprite.convert('RGB').quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    return Image.merge('RGBA', (*q.split(), al))


def main():
    src = Image.open(sys.argv[1])
    for name, box, seed, h, erase in JOBS:
        spr = cut(src, box, seed, erase)
        spr = downscale(spr, h)
        spr = snap(spr)
        spr = outline(spr)
        spr.save(OUT / f'{name}.png')
        print(name, spr.size)


if __name__ == '__main__':
    main()
