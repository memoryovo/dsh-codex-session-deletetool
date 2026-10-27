"""Render assets/icon-512.png from the same glyph as icon.svg.

The plugin market refuses SVG, so the 16x16 stroke path is redrawn with Pillow
at 4x and downsampled. Arcs are sampled into polylines and stroked with round
joints, so the result matches the SVG's round line caps instead of Pillow's
blocky `arc(width=...)` fill.
"""
import math

from PIL import Image, ImageDraw

OUT = 512
SS = 4  # supersample factor
S = OUT * SS
BG = (32, 34, 40, 255)
FG = (236, 238, 242, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)

U = S / 16.0  # one SVG user unit in pixels
W = max(1, int(round(1.2 * U)))


def p(x, y):
    return (x * U, y * U)


def stroke(points):
    d.line([p(x, y) for x, y in points], fill=FG, width=W, joint="curve")
    r = W / 2.0
    for x, y in (points[0], points[-1]):
        cx, cy = p(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FG)


def arc(cx, cy, r, a0, a1, steps=48):
    """Sample an elliptical arc in SVG user units; angles in degrees, clockwise
    in screen space (y grows downward), matching SVG's sweep direction."""
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


# Lid: M3 4.5h10
stroke([(3, 4.5), (13, 4.5)])
# Handle: M6.5 4.5V3.25 A.75.75 0 0 1 7.25 2.5 h1.5 a.75.75 0 0 1 .75.75 V4.5
stroke([(6.5, 4.5), (6.5, 3.25)] + arc(7.25, 3.25, 0.75, 180, 270, 20)[1:])
stroke([(7.25, 2.5), (8.75, 2.5)])
stroke(arc(8.75, 3.25, 0.75, 270, 360, 20)[:-1] + [(9.5, 4.5)])
# Body: M4.5 4.5 l.25 8.1 a.85.85 0 0 0 .85.8 h4.8 a.85.85 0 0 0 .85-.8 L11.5 4.5
stroke([(4.5, 4.5), (4.75, 12.6)] + arc(5.6, 12.6, 0.85, 90, 180, 24)[1:])
stroke([(5.6, 13.4), (10.4, 13.4)])
stroke(arc(10.4, 12.6, 0.85, 0, 90, 24)[:-1] + [(11.25, 12.6), (11.5, 4.5)])
# Slot: M8 7.75v3.9
stroke([(8, 7.75), (8, 11.65)])

img = img.resize((OUT, OUT), Image.LANCZOS)
img.save("assets/icon-512.png")
print("wrote assets/icon-512.png", img.size)
