"""Stage 1: OCR the nomenclature tables of the source PDFs.

The scans are three-column tables (N° | Désignation | CAT) ruled with vertical lines. Running
Tesseract on a whole page mixes the columns up, so each page is handled like this:

1. render it at 300 dpi (pdftoppm) and straighten it using the table's vertical rules,
2. locate the four vertical rules, which bound the three columns,
3. OCR each column on its own: the code column, the designation column (French), and the
   category column restricted to the digits 1-3,
4. keep every OCR line with its vertical position and per-word geometry and confidence.

Lines are matched to codes and categories later, in parse.py, so the cleanup rules there can
change without running the OCR again. Output: data/ocr/<source id>.json.

Needs: pdftoppm (poppler-utils), tesseract with the 'fra' language pack, Pillow and numpy.
Usage: python3 data/pipeline/ocr.py [source id ...]
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DPI = 300
MARGIN = 10  # pixels kept clear of a rule when cropping a column
RULE_MIN_FRACTION = 0.15  # a vertical rule spans at least this share of the page height


def render(pdf: Path, page: int, out_dir: Path) -> Image.Image:
    prefix = out_dir / f"p{page}"
    subprocess.run(
        ["pdftoppm", "-r", str(DPI), "-gray", "-png", "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(prefix)],
        check=True,
    )
    return Image.open(f"{prefix}.png").convert("L")


def vertical_rules(img: Image.Image) -> list[tuple[int, int, int]]:
    """Long vertical runs of dark pixels: (x, y_top, y_bottom) for each rule, left to right."""
    dark = np.asarray(img) < 160
    # Thicken horizontally so a slightly slanted or broken line still reads as one run.
    wide = dark.copy()
    wide[:, 1:] |= dark[:, :-1]
    wide[:, :-1] |= dark[:, 1:]
    wide[:, 2:] |= dark[:, :-2]
    h, w = wide.shape
    best = np.zeros(w, int)
    cur = np.zeros(w, int)
    for y in range(h):
        cur = np.where(wide[y], cur + 1, 0)
        best = np.maximum(best, cur)
    xs = np.where(best > h * RULE_MIN_FRACTION)[0]
    groups: list[list[int]] = []
    for x in xs:
        if groups and x - groups[-1][-1] <= 6:
            groups[-1].append(int(x))
        else:
            groups.append([int(x)])
    rules = []
    for g in groups:
        x = int(round(np.mean(g)))
        # Rules are often broken where a row ends; the table spans all segments, not just the longest.
        band = wide[:, max(0, x - 3) : x + 4].any(1)
        segments, start = [], None
        for y, on in enumerate(band):
            if on and start is None:
                start = y
            elif not on and start is not None:
                if y - start >= 40:
                    segments.append((start, y - 1))
                start = None
        if start is not None and h - start >= 40:
            segments.append((start, h - 1))
        rules.append((x, segments[0][0], segments[-1][1]))
    return rules


def skew_angle(img: Image.Image, rule: tuple[int, int, int]) -> float:
    """Angle (degrees) of a vertical rule, from where its dark pixels sit at the top and bottom."""
    dark = np.asarray(img) < 160
    x, top, bottom = rule
    span = bottom - top
    if span < 200:
        return 0.0

    def centre(y0: int, y1: int) -> float | None:
        band = dark[y0:y1, max(0, x - 15) : x + 16]
        cols = np.where(band.sum(0) > (y1 - y0) * 0.5)[0]
        return float(cols.mean()) + x - 15 if len(cols) else None

    a = centre(top + 20, top + 120)
    b = centre(bottom - 120, bottom - 20)
    if a is None or b is None:
        return 0.0
    return float(np.degrees(np.arctan2(b - a, span - 140)))


def tesseract_lines(img: Image.Image, args: list[str]) -> list[dict]:
    """Run Tesseract and group its words into lines: {top, bottom, words: [[text, x, w, conf]]}."""
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        img.save(f.name)
        # One thread per call: Tesseract's OpenMP threading makes small images 100x slower here.
        env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
        out = subprocess.run(["tesseract", f.name, "-", *args, "tsv"], check=True, capture_output=True, text=True, encoding="utf-8", env=env).stdout
    lines: dict[tuple[int, int, int], dict] = {}
    for row in csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        if row["level"] != "5" or not text:
            continue
        key = (int(row["block_num"]), int(row["par_num"]), int(row["line_num"]))
        top, height = int(row["top"]), int(row["height"])
        line = lines.setdefault(key, {"top": top, "bottom": top + height, "words": []})
        line["top"] = min(line["top"], top)
        line["bottom"] = max(line["bottom"], top + height)
        line["words"].append([text, int(row["left"]), int(row["width"]), round(float(row["conf"]))])
    return sorted(lines.values(), key=lambda l: (l["top"], l["words"][0][1]))


def erase_leaders(img: Image.Image) -> Image.Image:
    """Whiten dotted leaders ("animaux ........ 2"): OCR otherwise merges the dots with the last
    word and loses units ("10 t......" comes out as "10 ts"). A leader is a run of at least four
    small blobs on one line with short gaps; text never looks like that.
    """
    arr = np.asarray(img).copy()
    dark = arr < 140
    rows = dark.any(1)
    y = 0
    h = len(rows)
    while y < h:
        if not rows[y]:
            y += 1
            continue
        y0 = y
        while y < h and (rows[y] or (y + 2 < h and rows[y + 1 : y + 3].any())):
            y += 1
        band = dark[y0:y]
        cols = band.any(0)
        blobs = []  # (x0, x1, height)
        x = 0
        while x < len(cols):
            if not cols[x]:
                x += 1
                continue
            x0 = x
            while x < len(cols) and cols[x]:
                x += 1
            ys = np.where(band[:, x0:x].any(1))[0]
            blobs.append((x0, x, int(ys[-1] - ys[0] + 1)))
        run: list[tuple[int, int, int]] = []

        def flush() -> None:
            if len(run) >= 4:
                for bx0, bx1, _ in run:
                    arr[y0:y, bx0:bx1] = 255
            run.clear()

        for blob in blobs:
            x0, x1, bh = blob
            dot = x1 - x0 <= 10 and bh <= 10
            if dot and (not run or x0 - run[-1][1] <= 30):
                run.append(blob)
            else:
                flush()
                if dot:
                    run.append(blob)
        flush()
    return Image.fromarray(arr)


def category_marks(img: Image.Image, left: int, right: int, top: int, bottom: int) -> list[dict]:
    """Find each digit in the CAT column as a band of ink, then read it as a single character.

    Reading the whole column at once drops digits that sit against a horizontal rule; one
    glyph at a time does not.
    """
    col = img.crop((left + MARGIN, top, right - MARGIN, bottom))
    dark = np.asarray(col) < 140
    width = dark.shape[1]
    rows = dark.sum(1)
    rows[rows > width * 0.5] = 0  # horizontal table rules
    marks, start = [], None
    for y, n in enumerate(list(rows) + [0]):
        if n and start is None:
            start = y
        elif not n and start is not None:
            if 14 <= y - start <= 60:
                xs = np.where(dark[start:y].any(0))[0]
                x0, x1 = int(xs.min()), int(xs.max())
                glyph = col.crop((max(0, x0 - 12), max(0, start - 12), min(width, x1 + 13), min(col.height, y + 12)))
                read = tesseract_lines(glyph, ["--psm", "10", "-c", "tessedit_char_whitelist=123"])
                words = [w for line in read for w in line["words"]]
                if words:
                    text, _, _, conf = words[0]
                    marks.append({"top": top + start, "bottom": top + y, "words": [[text, left + MARGIN + x0, x1 - x0 + 1, conf]]})
            start = None
    return marks


def shift(lines: list[dict], dx: int, dy: int) -> list[dict]:
    for line in lines:
        line["top"] += dy
        line["bottom"] += dy
        for word in line["words"]:
            word[1] += dx
    return lines


def ocr_page(pdf: Path, page: int, tmp: Path) -> dict:
    img = render(pdf, page, tmp)
    rules = vertical_rules(img)
    if len(rules) >= 4:
        angle = skew_angle(img, max(rules, key=lambda r: r[2] - r[1]))
        if abs(angle) > 0.05:
            img = img.rotate(-angle, resample=Image.BICUBIC, fillcolor=255)
            rules = vertical_rules(img)
    if len(rules) != 4:
        raise SystemExit(f"{pdf.name} page {page}: expected 4 vertical table rules, found {len(rules)}: {rules}")
    (x0, *_), (x1, *_), (x2, *_), (x3, *_) = rules
    top = min(r[1] for r in rules)
    bottom = max(r[2] for r in rules)

    def column(left: int, right: int, args: list[str]) -> list[dict]:
        crop = erase_leaders(img.crop((left + MARGIN, top, right - MARGIN, bottom)))
        return shift(tesseract_lines(crop, args), left + MARGIN, top)

    # The band above the table carries an "Annexe N" heading on amending texts.
    heading = " ".join(
        w[0] for l in tesseract_lines(img.crop((0, 0, img.width, max(top, 1))), ["-l", "fra", "--psm", "4"]) for w in l["words"]
    )
    annex = re.search(r"annexe\s*([0-9Il|]+)", heading, re.I)
    return {
        "page": page,
        "size": list(img.size),
        "columns": [x0, x1, x2, x3],
        "annex": {"I": "1", "l": "1", "|": "1"}.get(annex.group(1), annex.group(1)) if annex else None,
        "codes": column(x0, x1, ["-l", "fra", "--psm", "6"]),
        "text": column(x1, x2, ["-l", "fra", "--psm", "4"]),
        "cats": category_marks(img, x2, x3, top, bottom),
    }


def main(only: list[str]) -> None:
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    out_dir = ROOT / "ocr"
    out_dir.mkdir(exist_ok=True)
    version = subprocess.run(["tesseract", "--version"], capture_output=True, text=True, encoding="utf-8").stdout.splitlines()[0]
    for src in manifest["sources"]:
        if only and src["id"] not in only:
            continue
        first, last = src["pages"]
        pages = []
        with tempfile.TemporaryDirectory() as tmp:
            for page in range(first, last + 1):
                print(f"OCR {src['id']} page {page}", file=sys.stderr)
                pages.append(ocr_page(ROOT / "sources" / src["file"], page, Path(tmp)))
        doc = {"source": src["id"], "engine": version, "dpi": DPI, "pages": pages}
        (out_dir / f"{src['id']}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
