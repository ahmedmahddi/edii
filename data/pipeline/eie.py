"""Extract the annex lists of décret n° 2005-1991 (étude d'impact sur l'environnement).

The PDF in data/sources is a Word export, so its text is exact: no OCR here. The script splits
annexe 1 (catégorie A, catégorie B: étude d'impact) and annexe 2 (cahier des charges) into
entries, attaches the rubriques of the EDII nomenclature that each entry suggests
(data/eie-links.json), and writes data/eie.json.

The suggestions are a reading, not part of the decree: the user always chooses the entry.

Needs: pdftotext (poppler-utils).
Usage: python3 data/pipeline/eie.py
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "sources/2005-07-11-decret-2005-1991-eie.pdf"

# Where each list starts in the text, and the prefix of its entry ids.
SECTIONS = [
    (r"-\s*Catégorie A\s*:", "A"),
    (r"-\s*Catégorie B\s*:", "B"),
    (r"ANNEXE II", "CDC"),
]


def clean(text: str) -> str:
    text = text.replace("’", "'").replace(" ", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:)])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = text.replace("entretient", "entretien")  # typo in the official text
    return text.rstrip(" .")


def entries(body: str) -> list[tuple[int, str]]:
    """Split one list into its numbered entries: "1) - Unités de…", "2) – Unités…", "4)- Les…"."""
    out = []
    for m in re.finditer(r"(?:^|\n)\s*(\d{1,2})\)\s*[-–]?\s*(.+?)(?=\n\s*\d{1,2}\)\s*[-–]?|\Z)", body, re.S):
        out.append((int(m.group(1)), clean(m.group(2))))
    return out


def main() -> None:
    text = subprocess.run(["pdftotext", str(ROOT / SOURCE), "-"], check=True, capture_output=True, text=True).stdout
    text = re.sub(r"\n\s*\d\s*\n", "\n", text)  # page numbers
    text = text.replace("\f", "\n")
    starts = []
    for pattern, kind in SECTIONS:
        m = re.search(pattern, text)
        if not m:
            raise SystemExit(f"{SOURCE}: no '{pattern}' in the text")
        starts.append((m.start(), m.end(), kind))
    links: dict[str, list[str]] = json.loads((ROOT / "eie-links.json").read_text())["links"]
    rubriques = {r["code"] for r in json.loads((ROOT / "nomenclature.json").read_text())["rubriques"]}

    out = []
    for i, (_, body_start, kind) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        body = text[body_start:end]
        # The heading sentence of a category ends at its first entry.
        first = re.search(r"\n\s*1\)", body)
        body = body[first.start() :] if first else body
        found = entries(body)
        numbers = [n for n, _ in found]
        if numbers != list(range(1, len(numbers) + 1)):
            raise SystemExit(f"{kind}: entries not numbered 1..n: {numbers}")
        for n, label in found:
            entry_id = f"{kind}{n}"
            suggested = links.get(entry_id, [])
            unknown = [c for c in suggested if c not in rubriques]
            if unknown:
                raise SystemExit(f"eie-links.json: {entry_id} links to unknown rubriques {unknown}")
            out.append({"id": entry_id, "annexe": kind, "number": n, "text": label, "rubriques": suggested})

    unknown_ids = set(links) - {e["id"] for e in out}
    if unknown_ids:
        raise SystemExit(f"eie-links.json: no such entries {sorted(unknown_ids)}")
    counts = {k: sum(1 for e in out if e["annexe"] == k) for _, k in SECTIONS}
    doc = {
        "title": "Décret n° 2005-1991 du 11 juillet 2005, relatif à l'étude d'impact sur l'environnement",
        "source": SOURCE,
        "annexes": {
            "A": "Annexe 1, catégorie A : étude d'impact, avis de l'ANPE sous 21 jours ouvrables",
            "B": "Annexe 1, catégorie B : étude d'impact, avis de l'ANPE sous 3 mois ouvrables",
            "CDC": "Annexe 2 : cahier des charges",
        },
        "entries": out,
    }
    (ROOT / "eie.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(out)} entries: {counts}")


if __name__ == "__main__":
    main()
