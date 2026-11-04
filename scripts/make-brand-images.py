"""Draws the brand images once: favicon (svg + ico), app icons and the 1200x630 share image.
Run from the repo root: python scripts/make-brand-images.py. Outputs are committed."""
from PIL import Image, ImageDraw, ImageFont
import os

BG, INK, ACC, MUTED = (15, 15, 14), (242, 240, 234), (255, 107, 44), (168, 166, 158)
OUT = 'landing/assets'
# The mark: two plates and a bar, five rects on a 28-unit grid.
RECTS = [(2, 11, 4, 6, ACC), (7, 7, 4, 14, ACC), (12, 13, 4, 2, INK), (17, 7, 4, 14, ACC), (22, 11, 4, 6, ACC)]

def mark(draw, x, y, scale):
    for rx, ry, w, h, c in RECTS:
        draw.rectangle([x + rx * scale, y + ry * scale, x + (rx + w) * scale - 1, y + (ry + h) * scale - 1], fill=c)

def icon(size, pad=0.16):
    im = Image.new('RGB', (size, size), BG)
    s = size * (1 - 2 * pad) / 28
    mark(ImageDraw.Draw(im), size * pad, size * pad, s)
    return im

os.makedirs(OUT, exist_ok=True)
with open(f'{OUT}/favicon.svg', 'w') as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#0f0f0e"/>'
            + ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>' for x, y, w, h, c in RECTS)
            + '</svg>\n')
icon(64, 0.06).save(f'{OUT}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
for s in (180, 192, 512):
    icon(s).save(f'{OUT}/icon-{s}.png')
# The app's own PWA icons, same mark.
icon(180).save('frontend/public/icon-180.png')
icon(512).save('frontend/public/icon-512.png')

og = Image.new('RGB', (1200, 630), BG)
d = ImageDraw.Draw(og)
mark(d, 80, 70, 3)
label = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 26)
d.text((180, 100), 'SÉRIE', font=label, fill=MUTED)
display = ImageFont.truetype('C:/Windows/Fonts/bahnschrift.ttf', 132)
try: display.set_variation_by_name('Bold Condensed')
except Exception: pass
d.text((76, 210), 'O TEU PLANO.', font=display, fill=INK)
d.text((76, 350), 'CADA SÉRIE.', font=display, fill=ACC)
sub = ImageFont.truetype('C:/Windows/Fonts/bahnschrift.ttf', 34)
d.text((80, 520), 'Plano do PT · demonstração de cada exercício · progressão automática', font=sub, fill=MUTED)
og.save(f'{OUT}/og.png', optimize=True)
print('ok')
