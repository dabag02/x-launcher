#!/usr/bin/env python3
"""check-themes.py — controllo dei colori dei temi (v3.2.0-Mars).

Uso (dalla radice del progetto):  python3 scripts/check-themes.py

Verifica che:
  - ogni colore con nome usato nel frontend (classi bg-xl-*, text-xl-*, border-xl-*, ring-xl-*,
    shadow-xl-*, … e variabili var(--xl-*)) sia definito in TUTTI i file themes/*.json;
  - ogni classe xl-* abbia la sua riga --color-xl-<nome> nel blocco @theme inline di src/index.css
    (senza, Tailwind non genera la classe e il colore sparisce in silenzio);
  - tutti i temi abbiano le stesse chiavi in "colors" (un tema parziale ricade sul tema scuro,
    ma è meglio saperlo) e la sezione "overlay" con chiavi #rrggbb valide.
Esce con codice 1 se trova problemi, così si può usare prima di una build o di un commit.

Per aggiungere un colore: una riga in "colors" di ogni themes/*.json e una riga
`--color-xl-<nome>: var(--xl-<nome>, <valore del tema scuro>);` in src/index.css.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CLASS_RE = re.compile(r"(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|shadow|from|via|to|outline|fill|stroke|divide|caret|accent|placeholder)-xl-([a-z0-9-]+)")
VAR_RE = re.compile(r"var\(--xl-([a-z0-9-]+)")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

sources = glob.glob("src/**/*.tsx", recursive=True) + glob.glob("src/**/*.ts", recursive=True)
used_classes, used_vars = set(), set()
for f in sources:
    text = open(f, encoding="utf-8").read()
    used_classes |= set(CLASS_RE.findall(text))
    used_vars |= set(VAR_RE.findall(text))

themes = {}
for f in sorted(glob.glob("themes/*.json")):
    try:
        themes[os.path.basename(f)[:-5]] = json.load(open(f, encoding="utf-8"))
    except Exception as e:  # noqa
        print(f"ERRORE: {f} non è JSON valido: {e}")
        sys.exit(1)

css = open("src/index.css", encoding="utf-8").read()
css_defined = set(re.findall(r"--color-xl-([a-z0-9-]+)\s*:", css))

problems = []
if not themes:
    problems.append("nessun tema in themes/")
for name, t in themes.items():
    colors = t.get("colors", {})
    for c in sorted(used_classes | used_vars):
        if c not in colors:
            problems.append(f"{name}.json: manca il colore '{c}' (usato nel frontend)")
    overlay = t.get("overlay", {})
    for k, v in overlay.items():
        if not HEX_RE.match(str(v)):
            problems.append(f"{name}.json: overlay.{k} = '{v}' non è #rrggbb")
for c in sorted(used_classes):
    if c not in css_defined:
        problems.append(f"src/index.css: manca --color-xl-{c} (la classe non verrebbe generata)")
keysets = {n: set(t.get("colors", {})) for n, t in themes.items()}
if len({frozenset(k) for k in keysets.values()}) > 1:
    allkeys = set().union(*keysets.values())
    for n, k in keysets.items():
        if allkeys - k:
            problems.append(f"{n}.json: chiavi presenti in altri temi ma non qui: {sorted(allkeys - k)}")

print(f"temi: {', '.join(themes) or '-'} · colori usati: {len(used_classes | used_vars)} · definiti in index.css: {len(css_defined)}")
if problems:
    print("\n".join("  ✗ " + p for p in problems))
    sys.exit(1)
print("  ✓ tutto a posto")
