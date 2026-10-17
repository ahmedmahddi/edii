/**
 * Some JORT issues (around 2000 to 2005) were made with fonts whose character codes are glyph
 * numbers in the standard Macintosh order, not letters: pdf.js then gives "6RPPDLUH" for
 * "Sommaire", "'pFUHWV" for "Décrets", a space being "\u0003". Codes 3 to 97 are the ASCII
 * characters 29 places further; codes from 98 are the accented letters and signs of that order,
 * read by pdf.js as MacRoman (so "p" is code 112, é; "É" is code 131, °).
 */

// pdf.js reads codes 128 to 255 as MacRoman: back to the code.
const MAC_ROMAN =
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";
const CODE = new Map([...MAC_ROMAN].map((ch, i) => [ch, 128 + i]));

// The standard Macintosh glyph order from 98 on (Adieresis, Aring…) lists the same characters as
// MacRoman from 128 on: glyph g is MAC_ROMAN[g - 98].
/** Text in such a font has codes below 32 (its spaces are code 3): that is how it is told apart. */
export function isGlyphCoded(text: string): boolean {
  return /[\u0003-\u001f]/.test(text);
}

/** The letters of a text written in glyph numbers. */
export function decodeGlyphs(text: string): string {
  let out = "";
  for (const ch of text) {
    // A plain space is pdf.js's, between words: kept (glyph 32, "=", is not used in titles).
    if (ch === " ") {
      out += " ";
      continue;
    }
    const code = ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : (CODE.get(ch) ?? -1);
    if (code >= 3 && code <= 97) out += String.fromCharCode(code + 29);
    else if (code >= 98 && code - 98 < MAC_ROMAN.length) out += MAC_ROMAN[code - 98].replace("\u00a0", " ");
    else out += ch;
  }
  // Glyph 182 and 183 are quotes (‘ ’): an apostrophe in these titles; 171 is the ellipsis of
  // leaders. The apostrophe of glyph 10 comes out of pdf.js as a space: "d établissements".
  return out
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/(^|[^\p{L}])([dlnjcsmt]|qu) (?=[aeiouyhéèêàâîôûAEIOUYHÉÈÊÀÂÎÔÛ])/gu, "$1$2'");
}
