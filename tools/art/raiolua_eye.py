# Sobe o olho do Raiolua (assets/monsters/cat_1.png) 2 px: ele ficava na altura do focinho e parecia caído.
# Uso: python tools/art/raiolua_eye.py   (roda sobre o PNG extraído por tools/extract_cats_ref.py)
from pathlib import Path
from PIL import Image

PNG = Path(__file__).resolve().parents[2] / 'assets' / 'monsters' / 'cat_1.png'
C = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
im = Image.open(PNG).convert('RGBA')
if im.getpixel((22, 16))[:3] == (0xff, 0xff, 0xff):
    fur = C('#3f3538')
    im.putpixel((22, 16), fur); im.putpixel((23, 16), fur)
    im.putpixel((22, 14), C('#ffffff')); im.putpixel((23, 14), C('#9ff6ff'))
    im.putpixel((23, 15), C('#5cc8e0'))  # brilho escorrendo do olho
    im.putpixel((22, 13), C('#120e13')); im.putpixel((23, 13), C('#120e13'))  # pálpebra/sobrancelha
    im.save(PNG)
    print('olho movido')
else:
    print('olho já ajustado')
