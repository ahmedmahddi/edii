"""Stage 2: turn the OCR output into the consolidated EDII nomenclature.

Reads data/ocr/<source>.json (stage 1) and data/corrections.json, and writes:

* data/nomenclature.json: every rubrique in force, with its classification items. Each item
  has its category (1, 2 or 3) and, when the text states one, a numeric threshold.
* data/review.md: what a person should check against the scans (low-confidence categories,
  thresholds that could not be read, corrections that no longer match anything).

No OCR runs here, so this stage is fast and deterministic: fix a misread by adding an entry to
corrections.json and running it again.

Usage: python3 data/pipeline/parse.py
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CAT_MIN_CONF = 60  # category digits read with less confidence go to review.md
JUNK_PX_PER_CHAR = 45  # dotted leaders come out of OCR as a few characters spread over a wide box
JUNK_CONF = 50


# --------------------------------------------------------------------------- page layout


@dataclass
class Line:
    source: str
    page: int
    top: int
    bottom: int
    text: str
    code: str | None = None
    cat: int | None = None
    cat_conf: int | None = None
    annex: str | None = None

    @property
    def centre(self) -> float:
        return (self.top + self.bottom) / 2

    @property
    def ref(self) -> str:
        return f"{self.source} p.{self.page} y={self.top}"


def is_junk(word: list) -> bool:
    text, _, width, conf = word
    if "(" in text or ")" in text:
        return False
    if re.match(r"^[\w/]+[.…]{2,}", text):  # a real word with the leader glued on: clean_words trims it
        return False
    if re.fullmatch(r"[\W_]+", text):
        return True
    if ONE_TONNE.match(text):
        return False
    if width / max(len(text), 1) > JUNK_PX_PER_CHAR:
        return True
    return conf < JUNK_CONF and re.fullmatch(r"[a-zA-Z]+", text) is not None and not UNIT_WORD.fullmatch(text)


ONE_TONNE = re.compile(r"^[IlL1|][tf]\b")  # "1 t" read as "It", "Lt", "1t"...
UNIT_WORD = re.compile(r"(?i)t|kg|g|l|hl|m3|m2|kw|mw|ha|an|j|h|mg")


def clean_words(words: list[list]) -> str:
    """Join OCR words, dropping the dotted leader that runs from the text to the CAT column."""
    words = [list(w) for w in words]
    while words and is_junk(words[-1]):
        words.pop()
    # The leader is often glued to the last real word: "animaux.......", "m3...".
    while words:
        text, _, width, _ = words[-1]
        m = re.match(r"^(.*?)[.…·,:;]*[.…]{2,}[^()]*$", text)
        if not m or width / max(len(text), 1) <= 25:
            break
        if m.group(1):
            words[-1][0] = m.group(1)
            break
        words.pop()
    text = " ".join(w[0] for w in words)
    text = re.sub(r"\s*[.…·,]*[.…]{2,}[.…·,\s]*$", "", text)
    return text.strip()


ENUM_FIX = re.compile(r"^([0-9]{1,2}|[a-zA-Z]|[IVX]{1,4})\s*[)}\]j]\s*(?=\S)")


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("’", "'").replace("‘", "'").replace("…", "...").replace("ÿ", "y")
    text = re.sub(r"^[|{\[]\s*", "", text)
    text = re.sub(r"^\((\d)\)\s*", r"\1) ", text)
    text = re.sub(r"^Il\)", "II)", text)
    text = re.sub(r"^(\w{1,4}\))\s*\)\s*", r"\1 ", text)  # "c) ) de 10"
    m = ENUM_FIX.match(text)
    if m and (len(m.group(1)) <= 2 or re.fullmatch(r"[IVX]+", m.group(1))):
        text = f"{m.group(1)}) " + text[m.end() :]
    # Misreads of units and digits that the scans make again and again.
    text = re.sub(r"(?<=\d)O|(?<=[\s\d])O(?=\d)", "0", text)
    text = re.sub(r"(?<=\d)\s*m[°'?²*](?=\W|$)", " m3", text)
    text = re.sub(r"(?<=\d)\s*[1Il|\[]/[j;]", " l/j", text)
    text = re.sub(r"(?<=\d)\s*[1Il|\[]/h\b", " l/h", text)
    text = re.sub(r"\b(kg|t|l|m3|hl)/\)", r"\1/j", text)
    text = re.sub(r"\b(\d{1,3}(?: \d{3})+)[1lI|](?=[\s,.;]|$)", r"\1 l", text)  # "1 5001" is "1 500 l"
    text = re.sub(r"(?<=à )[IlL1|][tf](?=\W|$)", "1 t", text)
    text = re.sub(r"(?<=[àa] )[|I](?= \S)", "1", text)
    text = re.sub(r"(?<=\d)S|(?<=[\s\d])S(?=\d)", "5", text)
    text = re.sub(r"\bkKW\b|\bKW\b|\bKw\b", "kW", text)
    text = re.sub(r"\bKg\b", "kg", text)
    text = re.sub(r"(?<=\d)\.(?=[a-zA-Z])", " ", text)
    text = re.sub(r"\b([àa]) \1\b", r"\1", text)
    text = re.sub(r"\s+([,.;:])(?=\s|$)", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def normalize_code(parts: list[str]) -> str | None:
    raw = " ".join(parts)
    m = re.match(r"\s*(\d{4})\b(.*)", raw)
    if not m:
        return None
    code, rest = m.group(1), m.group(2).lower()
    rest = rest.replace("(nouvelle)", "").strip()
    b = re.match(r"bis\s*([0-9il|]?)", rest)
    if b:
        n = {"i": "1", "l": "1", "|": "1"}.get(b.group(1), b.group(1))
        code += " bis" + (f" {n}" if n else "")
    return code


def page_lines(source: str, page: dict, corrections: "Corrections") -> list[Line]:
    lines = []
    for raw in page["text"]:
        text = normalize_text(clean_words(raw["words"]))
        if not text or re.match(r"(?i)d[ée]signation des activit", text):
            continue
        lines.append(Line(source, page["page"], raw["top"], raw["bottom"], text, annex=page["annex"]))

    # Codes: a 4-digit number, sometimes followed on the next line by "bis", "bis 2" or "(nouvelle)".
    codes: list[tuple[int, list[str]]] = []
    for raw in page["codes"]:
        text = " ".join(w[0] for w in raw["words"]).strip()
        if re.match(r"\d{4}", text):
            codes.append((raw["top"], [text]))
        elif codes and raw["top"] - codes[-1][0] < 120 and re.search(r"(?i)bis|nouvelle", text):
            codes[-1][1].append(text)
    for top, parts in codes:
        code = normalize_code(parts)
        target = min(lines, key=lambda l: abs(l.top - top), default=None)
        if code and target and abs(target.top - top) < 40:
            target.code = code
        elif code:
            lines.append(Line(source, page["page"], top, top + 40, "", code=code, annex=page["annex"]))
    lines.sort(key=lambda l: l.top)

    # Categories: the digit belongs to the line it sits next to. A few are printed half a line
    # low, so fall back to the nearest line above that has no category yet.
    for raw in page["cats"]:
        for text, _, _, conf in raw["words"]:
            if text not in {"1", "2", "3"}:
                continue
            centre = raw["top"] + 12
            near = [l for l in lines if abs(l.centre - centre) <= 22 and l.cat is None]
            above = [l for l in lines if 0 <= centre - l.centre <= 75 and l.cat is None]
            target = min(near, key=lambda l: abs(l.centre - centre)) if near else (max(above, key=lambda l: l.top) if above else None)
            if target is None:
                corrections.unplaced.append(f"{source} p.{page['page']} y={raw['top']}: category {text} matches no line")
                continue
            target.cat, target.cat_conf = int(text), conf
    return lines


# --------------------------------------------------------------------------- corrections


@dataclass
class Corrections:
    text: list[dict]
    category: list[dict]
    used: set[int] = field(default_factory=set)
    unplaced: list[str] = field(default_factory=list)

    @classmethod
    def load(cls) -> "Corrections":
        data = json.loads((ROOT / "corrections.json").read_text(encoding="utf-8"))
        return cls(data.get("text", []), data.get("category", []))

    def apply(self, lines: list[Line]) -> None:
        for i, fix in enumerate(self.text):
            for line in lines:
                if line.source == fix["source"] and line.page == fix["page"] and fix["find"] in line.text:
                    line.text = line.text.replace(fix["find"], fix["replace"])
                    self.used.add(i)
        for j, fix in enumerate(self.category):
            for line in lines:
                if line.source == fix["source"] and line.page == fix["page"] and line.text.startswith(fix["line_starts"]):
                    line.cat, line.cat_conf = fix["category"], 100
                    self.used.add(len(self.text) + j)

    def unused(self) -> list[dict]:
        everything = self.text + self.category
        return [c for i, c in enumerate(everything) if i not in self.used]


# --------------------------------------------------------------------------- thresholds

NUMBER = r"(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)"
UNITS = {
    # unit as written → (canonical unit, factor to the canonical unit)
    "t/j": ("t/j", 1), "tonnes/j": ("t/j", 1), "kg/j": ("t/j", 0.001), "kg/h": ("t/j", 0.024), "t/h": ("t/j", 24),
    "t/an": ("t/an", 1), "kg/an": ("t/an", 0.001),
    "t": ("kg", 1000), "tonnes": ("kg", 1000), "kg": ("kg", 1), "g": ("kg", 0.001),
    "m3": ("m3", 1), "m³": ("m3", 1), "l": ("m3", 0.001), "litres": ("m3", 0.001), "hl": ("m3", 0.1),
    "m3/j": ("m3/j", 1), "l/j": ("m3/j", 0.001), "m3/h": ("m3/h", 1), "l/h": ("m3/h", 0.001),
    "hl/an": ("hl/an", 1), "hl/j": ("hl/j", 1),
    "kw": ("kW", 1), "mw": ("kW", 1000), "w": ("kW", 0.001),
    "mbq": ("GBq", 0.001), "gbq": ("GBq", 1), "tbq": ("GBq", 1000),
    "m2": ("m2", 1), "m²": ("m2", 1), "ha": ("m2", 10000),
}
COUNT_WORDS = ["habitants", "cartouches", "animaux", "vaches", "œufs", "oeufs", "places", "emplacements", "postes", "lits", "personnes", "véhicules", "équivalents"]
UNIT_RE = re.compile(
    r"\s*(" + "|".join(sorted((re.escape(u) for u in UNITS), key=len, reverse=True)) + r"|" + "|".join(COUNT_WORDS) + r")(?![a-zà-ÿ])",
    re.I,
)


def number(s: str) -> float:
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+", s):
        return float(re.sub(r"[ .]", "", s))
    return float(s.replace(",", "."))


def quantity_after(text: str, pos: int) -> tuple[float, str | None, int] | None:
    """(number as written, unit as written or None, end) for the quantity starting at pos.

    A lone "1", "I" or "|" after a number is a misread "l" (litre) or "t" (tonne); it comes back
    as unit "?" and the rubrique's other units decide (see build_rubrique).
    """
    m = re.compile(r"\s*" + NUMBER).match(text, pos)
    if not m:
        return None
    value = number(m.group(1))
    amb = re.compile(r"\s+[1I|](?![\w/])").match(text, m.end())
    if amb:
        return value, "?", amb.end()
    u = UNIT_RE.match(text, m.end())
    if not u:
        return value, None, m.end()
    return value, u.group(1).lower(), u.end()


def convert(value: float, unit: str | None) -> tuple[float, str | None]:
    if unit is None or unit == "?":
        return value, unit
    if unit in UNITS:
        canon, factor = UNITS[unit]
        return round(value * factor, 9), canon
    return value, "animaux" if unit == "équivalents" else unit.replace("oeufs", "œufs")


def make_condition(bounds: list[tuple[str, bool, float, str | None]]) -> dict | None:
    """bounds: (min|max, inclusive, number as written, unit as written). A bound written without a
    unit takes the unit of the other one ("supérieure à 200, mais inférieure à 1 500 l")."""
    if not bounds:
        return None
    written = next((u for _, _, _, u in bounds if u and u != "?"), None) or next((u for _, _, _, u in bounds if u), None)
    cond: dict = {"_raw": {}}
    for kind, inclusive, raw, unit in bounds:
        cond["_raw"][kind] = (raw, unit if unit != "?" else None)
        cond[f"{kind}_inclusive"] = inclusive
    set_unit(cond, written)
    return cond


def set_unit(cond: dict, written: str | None) -> None:
    """(Re)compute the bounds from the numbers as written. A bound printed with its own unit keeps
    it ("100 kg, mais inférieure à 1 t"); the others take `written`."""
    cond["_written"] = written
    for kind, (raw, own) in cond["_raw"].items():
        cond[kind], canon = convert(raw, own or written)
        if canon:
            cond["unit"] = canon


SUP = r"sup[ée]rieur[ée]?s?"
INF = r"inf[ée]rieur[ée]?s?"
EGAL = r"[ée]gal[ée]?s?"
BOUNDS = [
    # phrase → (kind, inclusive); longer phrases first, overlapping matches are skipped
    (rf"{SUP}\s+ou\s+{EGAL}\s+[àa]", ("min", True)),
    (rf"{EGAL}\s+ou\s+{SUP}\s+[àa]", ("min", True)),
    (rf"{INF}\s+ou\s+{EGAL}\s+[àa]", ("max", True)),
    (rf"{EGAL}\s+ou\s+{INF}\s+[àa]", ("max", True)),
    (rf"{SUP}\s+[àa]", ("min", False)),
    (rf"{INF}\s+[àa]", ("max", False)),
    (r"de\s+plus\s+de", ("min", False)),
    (r"plus\s+de", ("min", False)),
    (r"au\s+moins", ("min", True)),
    (r"moins\s+de", ("max", False)),
    (r"jusqu'[àa]", ("max", True)),
    (r"au\s+plus", ("max", True)),
    (r"ne\s+d[ée]passe\s+pas(?:,?\s*m[êe]me\s+momentan[ée]ment,?)?", ("max", True)),
    (r"(?<!ne )d[ée]passe(?!\s+pas)", ("min", False)),
]


def parse_condition(text: str) -> dict | None:
    """Numeric range stated by a criterion, e.g. 'supérieure à 2 t, mais inférieure à 75 t'."""
    t = text.lower().replace("’", "'")
    t = re.sub(r"'(?=\d)", "", t)
    if re.search(r"quel(?:le)?s?\s*que\s+soi(?:en)?t|quelque\s+soit", t):
        return {"any": True}
    taken: list[tuple[int, int]] = []
    found: list[tuple[int, str, bool, tuple]] = []
    for pattern, (kind, inclusive) in BOUNDS:
        for m in re.finditer(pattern, t):
            if any(m.start() < e and s < m.end() for s, e in taken):
                continue
            q = quantity_after(t, m.end())
            if q:
                taken.append((m.start(), q[2]))
                found.append((m.start(), kind, inclusive, q))
    found.sort()
    kinds = [f[1] for f in found]
    if kinds.count("min") > 1 or kinds.count("max") > 1:
        # e.g. "quantité unitaire supérieure à 10 g et quantité stockée supérieure à 2 kg"
        return {"manual": True}
    if found:
        return make_condition([(kind, inclusive, q[0], q[1]) for _, kind, inclusive, q in found])
    m = re.search(r"\bde\s+" + NUMBER + r"\s*(?:[a-zœé/0-9]+\s+)?[àa]\s+" + NUMBER, t)
    if m:  # "de 50 à 200 animaux"
        lo, hi = quantity_after(t, m.start(1)), quantity_after(t, m.start(2))
        if lo and hi:
            return make_condition([("min", True, lo[0], lo[1]), ("max", True, hi[0], hi[1])])
    m = re.search(r"(?:de\s+)?" + NUMBER + r"\s+([a-zœé]+)?\s*et\s+plus", t)
    if m:  # "de 20 vaches et plus"
        q = quantity_after(t, m.start(1))
        if q:
            return make_condition([("min", True, q[0], q[1])])
    return None


# --------------------------------------------------------------------------- structure

ENUM = re.compile(r"^(?:([IVX]{1,4})\)|(\d{1,2})\)|([a-z])\)|([A-Z])\s*[-–]\s)")


def enum_level(text: str) -> int | None:
    m = ENUM.match(text)
    if not m:
        return None
    roman, digit, letter, capital = m.groups()
    if capital:
        return 0
    if roman:
        return 1
    return 2 if digit else 3


@dataclass
class Para:
    text: str
    level: int | None
    lines: list[Line]
    cat: int | None = None
    cat_conf: int | None = None


def paragraphs(lines: list[Line]) -> list[Para]:
    paras: list[Para] = []
    for line in lines:
        level = enum_level(line.text)
        prev = paras[-1] if paras else None
        joins = prev is not None and level is None and prev.cat is None and not prev.text.endswith(":")
        if joins and line.text:
            prev.text = f"{prev.text} {line.text}".replace("- ", "-") if prev.text.endswith("-") else f"{prev.text} {line.text}"
            prev.lines.append(line)
        elif line.text or line.cat:
            paras.append(Para(line.text, level, [line]))
        if line.cat is not None:
            target = paras[-1]
            target.cat, target.cat_conf = line.cat, line.cat_conf
    return paras


def title_of(first_line: str, text: str) -> str:
    """The name of the activity: the first printed line, up to its parenthesis or colon."""
    head = re.split(r"\s*\(|\s*:|\.\s", first_line or text, maxsplit=1)[0].strip(" ,;.")
    if len(head) > 90:
        head = head[:90].rsplit(" ", 1)[0] + "…"
    return head if len(head) >= 3 else text[:90]


def build_rubrique(code: str, section: str | None, lines: list[Line], source: str, review: list[str]) -> dict:
    paras = paragraphs(lines)
    head = paras[0] if paras else Para("", None, [])
    intro = [head.text]
    items = []
    stack: dict[int, str] = {}
    context = ""  # last free sentence before the items, e.g. "La capacité de production étant :"
    for i, p in enumerate(paras):
        if p.level is not None:
            for lvl in [k for k in stack if k >= p.level]:
                del stack[lvl]
            if p.cat is None:
                stack[p.level] = p.text
                context = ""
        elif i > 0 and p.cat is None:
            if items or stack:
                context = p.text
            else:
                intro.append(p.text)
        if p.cat is not None:
            path = [stack[k] for k in sorted(stack)]
            criterion = p.text if i > 0 else ""
            cond = parse_condition(criterion or p.text) if (criterion or len(paras) == 1) else None
            item = {"path": path, "context": context or None, "criterion": criterion, "category": p.cat, "condition": cond}
            item["ref"] = p.lines[-1].ref
            if p.cat_conf is not None and p.cat_conf < CAT_MIN_CONF:
                review.append(f"`{code}` category {p.cat} read with confidence {p.cat_conf}: {criterion or head.text[:80]!r} ({item['ref']})")
            items.append(item)
    text = " ".join(t for t in intro if t)

    # Units are often dropped or misread on a single line ("10 1" for "10 t"); the other items of
    # the same variant (same path), or failing that of the rubrique, tell us which.
    def units_of(group: list[dict]) -> set[str]:
        return {it["condition"]["unit"] for it in group if it["condition"] and it["condition"].get("unit", "?") != "?"}

    def written_units(group: list[dict]) -> set[str]:
        return {it["condition"]["_written"] for it in group if it["condition"] and it["condition"].get("_written") not in (None, "?")}

    for it in items:
        c = it["condition"]
        if not c or "_raw" not in c or c["_written"] not in (None, "?"):
            continue
        units = written_units([o for o in items if o["path"] == it["path"]]) or written_units(items)
        if c["_written"] == "?":  # a lone "1": litre or tonne
            mass = {"t", "kg", "tonnes"} & units or (not units and re.search(r"\bkg\b|\btonnes?\b", text + " " + (it["context"] or "")))
            set_unit(c, "t" if mass else "l")
            c["unit_inferred"] = True
        elif len(units) == 1:
            set_unit(c, next(iter(units)))
            c["unit_inferred"] = True
        elif counted := re.search(r"nombre\s+(?:total\s+)?(?:des|de|d')\s*([a-zéè]+)", f"{text} {it['context'] or ''}"):
            set_unit(c, counted.group(1))  # "nombre total des machines à coudre étant : 1) supérieur à 100"
            c["unit_inferred"] = True
        else:
            c["manual"] = True  # never compare a quantity with a bare number
            review.append(f"`{code}` threshold without a unit, left to the reader: {it['criterion'] or text[:80]!r} ({it['ref']})")
    for it in items:
        c = it["condition"] or {}
        if c.get("manual") and "unit" in c or (c.get("manual") and len(c) == 1):
            review.append(f"`{code}` states several thresholds at once; the classifier shows the text instead: {it['criterion'] or text[:120]!r} ({it['ref']})")
        crit = it["criterion"] or text
        if re.search(rf"\bmais\s+{INF}", crit) and "max" not in c and not c.get("manual"):
            review.append(f"`{code}` upper bound not read: {crit!r} ({it['ref']})")
        if re.search(rf"\bmais\s+{SUP}", crit) and "min" not in c and not c.get("manual"):
            review.append(f"`{code}` lower bound not read: {crit!r} ({it['ref']})")
        if re.search(r"\b\d \d{4}\b", crit):
            review.append(f"`{code}` odd digit grouping in the official text, read as {c.get('min') or c.get('max')}: {crit!r} ({it['ref']})")
        if len(items) > 1 and it["condition"] is None and re.search(r"\d|sup[ée]rieur|inf[ée]rieur|plus de", ENUM.sub("", it["criterion"])):
            review.append(f"`{code}` no threshold read for category {it['category']}: {it['criterion']!r} ({it['ref']})")
    # Within one variant, a larger quantity never gives a less severe category, and ranges do not
    # overlap. A violation almost always means a misread digit.
    def plain_scale(it: dict) -> bool:
        """'1) supérieure à 2 t' is a step of a scale; '2) peroxydes du groupe Gr3, la quantité étant
        supérieure à 1 kg' describes a different case that only shares the heading."""
        crit = ENUM.sub("", it["criterion"]).lower()
        first = min((m.start() for pat, _ in BOUNDS for m in [re.search(pat, crit)] if m), default=None)
        return first is not None and first <= 30

    groups: dict[tuple, list[dict]] = {}
    for it in items:
        c = it["condition"]
        if c and ("min" in c or "max" in c) and not c.get("manual") and plain_scale(it):
            groups.setdefault((tuple(it["path"]), it["context"], c.get("unit")), []).append(it)
    for it in items:
        c = it["condition"] or {}
        if "min" in c and "max" in c and c["min"] >= c["max"]:
            review.append(f"`{code}` empty range (min ≥ max): {it['criterion']!r} → {c['min']} / {c['max']} ({it['ref']})")
    for group in groups.values():
        ranked = sorted(group, key=lambda it: (it["condition"].get("min", float("-inf")), it["condition"].get("max", float("inf"))))
        for lo, hi in zip(ranked, ranked[1:]):
            a, b = lo["condition"], hi["condition"]
            if lo["category"] < hi["category"]:
                review.append(f"`{code}` category {lo['category']} for the smaller quantity but {hi['category']} for the larger: {lo['criterion']!r} / {hi['criterion']!r} ({hi['ref']})")
            a_max, b_min = a.get("max", float("inf")), b.get("min", float("-inf"))
            if a_max > b_min or (a_max == b_min and a.get("max_inclusive", True) and b.get("min_inclusive", True) and lo["category"] != hi["category"]):
                review.append(f"`{code}` ranges overlap: {lo['criterion']!r} / {hi['criterion']!r} ({hi['ref']})")

    definition = not items and re.search(r"\(d[ée]finition", text) is not None
    if not items and not definition:
        review.append(f"`{code}` has no category ({lines[0].ref}): {text[:100]!r}")
    for it in items:
        if it["condition"]:
            it["condition"] = {k: v for k, v in it["condition"].items() if not k.startswith("_")}
    return {
        "code": code,
        "section": section,
        "title": title_of(next((l.text for l in lines if l.text), ""), text),
        "text": text,
        "items": items,
        "kind": "definition" if definition else "activity",
        "source": source,
        "ref": lines[0].ref if lines else None,
    }


def split_rubriques(lines: list[Line], source: str, review: list[str]) -> tuple[list[dict], dict[str, str]]:
    """Cut the flat line list at each code. Returns (rubriques, section titles)."""
    rubriques, sections = [], {}
    current: tuple[str, list[Line], str | None] | None = None
    group = None  # 1100, 1200...: a code ending in 00 that heads a group of rubriques

    def flush() -> None:
        if current and not current[0].endswith("00"):
            rub = build_rubrique(current[0], group, current[1], source, review)
            rub["annex"] = current[2]
            rubriques.append(rub)

    for line in lines:
        if line.code:
            flush()
            if line.code.endswith("00"):
                group = line.code
                sections[line.code] = line.text.capitalize() if line.text.isupper() else line.text
                current = (line.code, [line], line.annex)
                continue
            current = (line.code, [line], line.annex)
        elif current:
            current[1].append(line)
        elif line.text or line.cat:
            review.append(f"text before any code ({line.ref}): {line.text[:80]!r}")
    flush()
    return rubriques, sections


# --------------------------------------------------------------------------- consolidation


def main() -> None:
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    corrections = Corrections.load()
    review: list[str] = []
    by_code: dict[str, dict] = {}
    order: list[str] = []
    sections: dict[str, str] = {}
    history: list[dict] = []

    for src in manifest["sources"]:
        ocr = json.loads((ROOT / "ocr" / f"{src['id']}.json").read_text(encoding="utf-8"))
        lines: list[Line] = []
        annex = None
        for page in ocr["pages"]:
            annex = page["annex"] or annex
            page["annex"] = annex
            lines.extend(page_lines(src["id"], page, corrections))
        corrections.apply(lines)
        rubriques, secs = split_rubriques(lines, src["id"], review)
        for code, title in secs.items():
            sections.setdefault(code, title)
        for rub in rubriques:
            code = rub["code"]
            action = "base" if src["role"] == "base" else src["annexes"][rub.pop("annex") or "1"]
            rub.pop("annex", None)
            if action == "base":
                if code in by_code:
                    review.append(f"`{code}` appears twice in the base text ({rub['ref']}); the second one is kept")
                else:
                    order.append(code)
                by_code[code] = rub
            elif action == "modify":
                if code not in by_code:
                    order.append(code)  # a new code inside a "modify" annex, e.g. 2722 bis 1
                else:
                    rub["amended_by"] = by_code[code].get("amended_by", []) + [src["id"]]
                    rub["replaces"] = by_code[code]["source"]
                by_code[code] = rub
            else:  # complete
                if code in by_code:
                    # The 2010 text restates 2724 as a bare definition and moves its thresholds to
                    # new "bis" rubriques, as it does for 2722 in annex 1: the restatement replaces.
                    review.append(
                        f"`{code}` is restated by {src['id']} (annex 'complete') although it exists; the new text replaces the old one "
                        f"({len(by_code[code]['items'])} items → {len(rub['items'])}). Confirm this reading of the text."
                    )
                    rub["amended_by"] = by_code[code].get("amended_by", []) + [src["id"]]
                    rub["replaces"] = by_code[code]["source"]
                    by_code[code] = rub
                else:
                    order.append(code)
                    by_code[code] = rub
            history.append({"source": src["id"], "action": action, "code": code})

    for line in corrections.unplaced:
        review.append(line)
    for fix in corrections.unused():
        review.append(f"correction no longer matches anything: {json.dumps(fix, ensure_ascii=False)}")

    def sort_key(code: str) -> tuple:
        m = re.match(r"(\d{4})(?: bis(?: (\d))?)?", code)
        return (int(m.group(1)), 0 if "bis" not in code else 1, int(m.group(2) or 0))

    rubriques = [by_code[c] for c in sorted(set(order), key=sort_key)]
    out = {
        "title": "Nomenclature des établissements dangereux, insalubres ou incommodes (Tunisie)",
        "sources": [{k: s[k] for k in ("id", "title", "jort", "role")} for s in manifest["sources"]],
        "categories": {
            "1": "1ère catégorie",
            "2": "2ème catégorie",
            "3": "3ème catégorie",
            "NC": "Non classé: activité absente de la nomenclature ou en dessous du plus petit seuil",
        },
        "sections": dict(sorted(sections.items())),
        "rubriques": rubriques,
    }
    (ROOT / "nomenclature.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    n_items = sum(len(r["items"]) for r in rubriques)
    n_cond = sum(1 for r in rubriques for it in r["items"] if it["condition"])
    report = [
        "# EDII nomenclature: OCR review",
        "",
        "Generated by `data/pipeline/parse.py`. Check each line against the scan, then fix it in",
        "`data/corrections.json` (or confirm it is right) and run the parser again.",
        "",
        f"* {len(rubriques)} rubriques, {n_items} classification items, {n_cond} with a threshold read as numbers",
        f"* {len(review)} points to check",
        "",
    ] + [f"- {r}" for r in review]
    (ROOT / "review.md").write_text("\n".join(report) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(rubriques)} rubriques, {n_items} items ({n_cond} with thresholds), {len(review)} review points")


if __name__ == "__main__":
    main()
