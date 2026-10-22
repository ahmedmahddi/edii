/**
 * PDF → positioned text lines, with pdf.js (pure JavaScript: no poppler or Python needed, so it
 * runs on Windows as is). Node only: used by scripts/veille.ts and the tests, never by the page.
 */
import { getDocument, PDFDataRangeTransport, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fetchRetry } from "./fetch";
import { decodeGlyphs, isGlyphCoded } from "./glyphs";
import type { Line } from "./jort";

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
}

const OPTIONS = { useSystemFonts: true, isEvalSupported: false, verbosity: 0 };

/** Lines of the first `maxPages` pages (all pages when omitted), page by page. */
export async function pdfLines(data: Uint8Array, maxPages?: number): Promise<Line[][]> {
  return linesOf(await getDocument({ data, ...OPTIONS }).promise, maxPages);
}

const CHUNK = 1 << 16;

/**
 * The same, from a URL, downloading only the parts of the file pdf.js needs for those pages (its
 * index and their objects) when the server sends parts of files: a 100 MB issue then costs a few
 * hundred kilobytes. Null when there is no PDF at that address (404, or an HTML page).
 */
export async function pdfLinesFromUrl(
  url: string,
  maxPages: number,
  headers: Record<string, string> = {},
  last?: (page: Line[], index: number) => boolean, // stop after this page (the sommaire is over)
): Promise<{ lines: Line[][]; bytes: number } | null> {
  let bytes = 0;
  const part = async (begin: number, end: number, attempt = 0): Promise<Uint8Array> => {
    const res = await fetchRetry(url, { headers: { ...headers, Range: `bytes=${begin}-${end - 1}` } });
    if (res.status !== 206 && res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
    let chunk: Uint8Array;
    try {
      chunk = new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      // The connection broke while the part came: ask for it again, a few times.
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      return part(begin, end, attempt + 1);
    }
    bytes += chunk.length;
    return res.status === 200 ? chunk.slice(begin, end) : chunk;
  };
  const first = await fetchRetry(url, { headers: { ...headers, Range: `bytes=0-${CHUNK - 1}` } });
  if (first.status === 404) return null;
  if (!first.ok) throw new Error(`${url}: HTTP ${first.status}`);
  const head = new Uint8Array(await first.arrayBuffer());
  bytes += head.length;
  if (new TextDecoder().decode(head.slice(0, 5)) !== "%PDF-") return null; // a missing issue's HTML page
  const total = Number(first.headers.get("content-range")?.split("/")[1]);
  if (first.status !== 206 || !total || total <= head.length) {
    // The whole file came at once: no parts to ask for.
    return { lines: await linesOf(await getDocument({ data: head, ...OPTIONS }).promise, maxPages, last), bytes };
  }
  // A failed part would leave pdf.js waiting: it ends the reading instead.
  let fail: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => (fail = reject));
  const transport = new PDFDataRangeTransport(total, head);
  transport.requestDataRange = (begin: number, end: number) => {
    part(begin, end).then((chunk) => transport.onDataRange(begin, chunk), fail);
  };
  const doc = await Promise.race([
    getDocument({ range: transport, disableAutoFetch: true, disableStream: true, rangeChunkSize: CHUNK, ...OPTIONS }).promise,
    failed,
  ]);
  return { lines: await Promise.race([linesOf(doc, maxPages, last), failed]), bytes };
}

/**
 * Pages as images (PNG, or JPEG to keep samples small), `dpi` dots per inch, for OCR of scanned issues. pdf.js draws them on
 * @napi-rs/canvas, which it brings along (prebuilt for Windows, macOS and Linux).
 */
export async function pdfPageImages(data: Uint8Array, pages: number[], dpi = 200, type: "image/png" | "image/jpeg" = "image/png"): Promise<Buffer[]> {
  const doc = await getDocument({ data, ...OPTIONS }).promise;
  try {
    const out: Buffer[] = [];
    for (const n of pages.filter((n) => n <= doc.numPages)) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      // The factory pdf.js made for this document, on @napi-rs/canvas (not in its public types).
      const factory = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { toBuffer(type: string, quality?: number): Buffer }; context: CanvasRenderingContext2D } } }).canvasFactory;
      const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: context, viewport }).promise;
      out.push(type === "image/jpeg" ? canvas.toBuffer(type, 80) : canvas.toBuffer(type));
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

async function linesOf(doc: PDFDocumentProxy, maxPages?: number, last?: (page: Line[], index: number) => boolean): Promise<Line[][]> {
  try {
    const pages: Line[][] = [];
    const count = Math.min(doc.numPages, maxPages ?? doc.numPages);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const texts = content.items.filter((raw) => "str" in raw && raw.str) as { str: string; fontName: string; transform: number[]; width: number }[];
      // Fonts whose codes are glyph numbers (issues around 2000-2005): decoded before anything else.
      const coded = new Set(texts.filter((t) => isGlyphCoded(t.str)).map((t) => t.fontName));
      const items: Item[] = texts.map((t) => ({
        str: coded.has(t.fontName) ? decodeGlyphs(t.str) : t.str,
        x: t.transform[4],
        y: t.transform[5],
        width: t.width,
      }));
      pages.push(toLines(items));
      if (last?.(pages[pages.length - 1], pages.length - 1)) break;
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

/**
 * Group items on the same baseline (±2 pt) into lines, left to right, spacing words apart. A page
 * number may sit a little lower than its title's leader dots (up to 4 pt, in issues of 2000): it
 * joins the nearest line within 4 pt, one that ends with leaders first.
 */
export function toLines(raw: Item[]): Line[] {
  const items = splitNumbers(raw);
  const rows: { y: number; items: Item[] }[] = [];
  const isNumber = (item: Item) => /^\s*\d+\s*$/.test(item.str);
  for (const item of items.filter((i) => !isNumber(i))) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  // Ends with leader dots, digits already placed aside (a number is placed digit by digit).
  const leaders = (r: { items: Item[] }) => /[.…]\s*$/.test(r.items.filter((i) => !isNumber(i)).map((i) => i.str).join(""));
  for (const item of items.filter(isNumber)) {
    const near = rows
      .filter((r) => Math.abs(r.y - item.y) <= 4)
      .sort((a, b) => Number(leaders(b)) - Number(leaders(a)) || Math.abs(a.y - item.y) - Math.abs(b.y - item.y));
    if (near.length && (Math.abs(near[0].y - item.y) <= 2 || leaders(near[0]))) near[0].items.push(item);
    else {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
      if (row) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
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
