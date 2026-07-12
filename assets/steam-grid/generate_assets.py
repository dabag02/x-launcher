#!/usr/bin/env python3
"""
generate_assets.py — Genera gli asset PNG per la cartella Steam grid di
X-Launcher (boxart, hero, logo, capsule), disegnati direttamente con
Pillow invece che convertiti da SVG (rsvg-convert non disponibile in
questo ambiente di build) — stesso identico design dei file .svg
sorgente conservati nella stessa cartella per riferimento/manutenzione
futura, nel caso un ambiente con un convertitore SVG sia disponibile più
avanti.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

BG_DARK = (11, 12, 15)
BG_DARK2 = (21, 23, 28)
BLUE = (59, 130, 246)
TEXT_LIGHT = (243, 244, 246)
TEXT_GRAY = (156, 163, 175)
BOX_BG = (26, 29, 36)


def gradient_v(size, c1, c2):
    w, h = size
    img = Image.new("RGB", size)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        for x in range(w):
            img.putpixel((x, y), (r, g, b))
    return img


def draw_x_badge(draw, cx, cy, box_size, corner, border_w, font_size):
    half = box_size // 2
    draw.rounded_rectangle(
        [cx - half, cy - half, cx + half, cy + half],
        radius=corner, fill=BOX_BG, outline=BLUE, width=border_w,
    )
    font = ImageFont.truetype(FONT_BOLD, font_size)
    bbox = draw.textbbox((0, 0), "X", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), "X", fill=BLUE, font=font)


def centered_text(draw, cx, y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw / 2 - bbox[0], y), text, fill=fill, font=font)


# --- boxart.png — 600x900, verticale ---
img = gradient_v((600, 900), BG_DARK, BG_DARK2)
draw = ImageDraw.Draw(img)
draw.rectangle([0, 0, 600, 6], fill=BLUE)
draw_x_badge(draw, 300, 400, 180, 28, 4, 140)
centered_text(draw, 300, 610, "X-LAUNCHER", ImageFont.truetype(FONT_BOLD, 56), TEXT_LIGHT)
centered_text(draw, 300, 668, "HTPC GAME DASHBOARD", ImageFont.truetype(FONT_REGULAR, 24), TEXT_GRAY)
img.save(os.path.join(OUT_DIR, "boxart.png"))

# --- hero.png — 3840x1240, orizzontale, con badge a destra ---
img = gradient_v((3840, 1240), BG_DARK, (28, 32, 48))
draw = ImageDraw.Draw(img)
draw_x_badge(draw, 2880, 620, 360, 56, 8, 280)
centered_text(draw, 1100, 500, "X-LAUNCHER", ImageFont.truetype(FONT_BOLD, 140), TEXT_LIGHT)
centered_text(draw, 1100, 660, "La tua libreria giochi, in un'unica Dashboard", ImageFont.truetype(FONT_REGULAR, 46), TEXT_GRAY)
img.save(os.path.join(OUT_DIR, "hero.png"))

# --- logo.png — 1280x720, overlay trasparente ---
img = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw_x_badge(draw, 640, 320, 260, 40, 6, 200)
centered_text(draw, 640, 560, "X-LAUNCHER", ImageFont.truetype(FONT_BOLD, 72), TEXT_LIGHT)
img.save(os.path.join(OUT_DIR, "logo.png"))

# --- capsule.png — 600x350, orizzontale, badge a sinistra ---
img = gradient_v((600, 350), BG_DARK, (24, 27, 34))
draw = ImageDraw.Draw(img)
draw.rectangle([0, 0, 6, 350], fill=BLUE)
draw_x_badge(draw, 110, 175, 116, 20, 3, 90)
font_title = ImageFont.truetype(FONT_BOLD, 40)
bbox = draw.textbbox((0, 0), "X-LAUNCHER", font=font_title)
draw.text((200, 148 - bbox[1]), "X-LAUNCHER", fill=TEXT_LIGHT, font=font_title)
font_sub = ImageFont.truetype(FONT_REGULAR, 20)
draw.text((200, 198), "HTPC Game Dashboard", fill=TEXT_GRAY, font=font_sub)
img.save(os.path.join(OUT_DIR, "capsule.png"))

print("Asset generati:", os.listdir(OUT_DIR))
