/**
 * PDF → positioned text lines, with pdf.js (pure JavaScript: no poppler or Python needed, so it
 * runs on Windows as is). Node only: used by scripts/veille.ts and the tests, never by the page.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Line } from "./jort";

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Lines of the first `maxPages` pages (all pages when omitted), page by page. */
export async function pdfLines(data: Uint8Array, maxPages?: number): Promise<Line[][]> {
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    const pages: Line[][] = [];
    const count = Math.min(doc.numPages, maxPages ?? doc.numPages);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str) continue;
        items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width });
      }
      pages.push(toLines(items));
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

/**
 * Digits of a page number sometimes come as overlapping runs ("3", then "5 5" with a "9" placed
 * inside it): split such runs into characters, each at its own position, so sorting by x puts
 * them back in order.
 */
function splitNumbers(items: Item[]): Item[] {
  return items.flatMap((item) => {
    if (!/^[\d\s]+$/.test(item.str) || item.str.trim().length < 2) return [item];
    const step = item.width / item.str.length;
    return [...item.str]
      .map((ch, i) => ({ str: ch, x: item.x + i * step, y: item.y, width: step }))
      .filter((c) => c.str !== " ");
  });
}

/** Group items on the same baseline (±2 pt) into lines, left to right, spacing words apart. */
export function toLines(raw: Item[]): Line[] {
  const items = splitNumbers(raw);
  const rows: { y: number; items: Item[] }[] = [];
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const item of row.items) {
      const gap = item.x - end;
      if (text && gap > 1 && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
      text += item.str;
      end = item.x + item.width;
    }
    return { x: row.items[0].x, y: row.y, text };
  });
}
