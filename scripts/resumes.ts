/**
 * Writing the résumés of the référentiel's texts, batch after batch, the most useful first.
 *
 *   npx tsx scripts/resumes.ts --stats          how many are written, by priority
 *   npx tsx scripts/resumes.ts --next 40        the next 40 texts to summarise, with their articles
 *   npx tsx scripts/resumes.ts --next 40 --corps   only texts whose articles are read
 *
 * Priority: 1. the texts among the 30 essentials of at least one site (every trade, every rubrique of
 * the nomenclature in each category); 2. the texts ticked for at least one of those sites; 3. those
 * that apply to some site; 4. the rest. Résumés are written in data/referentiel/resumes/*.json, one
 * file per batch: { "<text key>": "<résumé>" }, the key being the text's first key (n:décret:2005-1991)
 * or its id. The articles come from data/veille/corps/ (npm run veille -- --fiches); a text whose
 * body was not found is summarised from its title, and says so.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nomenclature from "../data/nomenclature.json";
import { importance } from "../lib/registre/importance";
import { derivedFlags, EMPTY_SITE, FLAGS, METIERS, type Site, toggleMetier } from "../lib/registre/profil";
import { catalogue, keysOf, proposals, type Texte } from "../lib/registre/referentiel";
import { SIGNED } from "../lib/veille/fiche";

const ROOT = process.cwd();
const RESUMES = path.join(ROOT, "data", "referentiel", "resumes");
const CORPS = path.join(ROOT, "data", "veille", "corps");
const ORDER = path.join(CORPS, "ordre.json"); // cached: computing it takes a minute

export const keyOf = (t: Texte) => keysOf(t)[0] ?? t.id;

function written(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(RESUMES))
    for (const f of readdirSync(RESUMES).filter((f) => f.endsWith(".json"))) Object.assign(out, JSON.parse(readFileSync(path.join(RESUMES, f), "utf8")));
  return out;
}

function order(texts: Texte[]): { id: string; tier: number }[] {
  if (existsSync(ORDER) && !process.argv.includes("--fresh")) return JSON.parse(readFileSync(ORDER, "utf8"));
  const sites: Site[] = METIERS.map((m) => toggleMetier({ ...EMPTY_SITE, effectif: 60 }, m.id));
  for (const r of (nomenclature as { rubriques: { code: string; section: string }[] }).rubriques)
    for (const c of [1, 2, 3] as const)
      sites.push({ classe: c, sections: [r.section], rubriques: [r.code], etude: c === 1 ? "eie_a" : "cahier_des_charges", effectif: 60, flags: derivedFlags([r.section]) });
  const tier = new Map<string, number>();
  const score = new Map<string, number>();
  const all: Site = { ...EMPTY_SITE, classe: 1, effectif: 500, flags: FLAGS.map((f) => f.id), metiers: METIERS.map((m) => m.id) };
  for (const p of proposals(texts, all)) tier.set(p.texte.id, 3);
  for (const s of sites) {
    const ticked = proposals(texts, s)
      .filter((p) => p.proposed)
      .map((p) => ({ id: p.texte.id, score: importance(p.texte, s).score }))
      .sort((a, b) => b.score - a.score);
    ticked.forEach((x, i) => {
      tier.set(x.id, Math.min(tier.get(x.id) ?? 4, i < 30 ? 1 : 2));
      score.set(x.id, Math.max(score.get(x.id) ?? 0, x.score));
    });
  }
  const out = texts
    .map((t) => ({ id: t.id, tier: tier.get(t.id) ?? 4, score: score.get(t.id) ?? 0 }))
    .sort((a, b) => a.tier - b.tier || b.score - a.score)
    .map(({ id, tier }) => ({ id, tier }));
  writeFileSync(ORDER, JSON.stringify(out));
  return out;
}

function corps(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(CORPS))
    for (const f of readdirSync(CORPS).filter((f) => /^\d{4}\.json$/.test(f))) Object.assign(out, JSON.parse(readFileSync(path.join(CORPS, f), "utf8")));
  return out;
}

function main(): void {
  const feed = JSON.parse(readFileSync(path.join(ROOT, "public", "veille", "feed.json"), "utf8"));
  const texts = catalogue(feed.hits, feed.amendments, feed.citations);
  const byId = new Map(texts.map((t) => [t.id, t]));
  const done = written();
  const ranked = order(texts).filter((x) => byId.has(x.id));
  if (process.argv.includes("--stats")) {
    const counts = [1, 2, 3, 4].map((tier) => {
      const ids = ranked.filter((x) => x.tier === tier);
      return `${["", "essentiels", "cochés", "applicables", "autres"][tier]} : ${ids.filter((x) => done[keyOf(byId.get(x.id)!)]).length} / ${ids.length}`;
    });
    console.log(`Résumés écrits : ${Object.keys(done).length}. ${counts.join(" · ")}`);
    return;
  }
  const n = Number(process.argv[process.argv.indexOf("--next") + 1]) || 40;
  const max = Number(process.argv[process.argv.indexOf("--chars") + 1]) || 1400;
  const bodies = corps();
  const bodyOf = (t: Texte) => bodies[t.origine === "jort" ? t.id.slice(5) : (t.jort?.slice(5) ?? "")];
  // --corps: only the texts whose articles are read (while --fiches is still reading).
  const onlyRead = process.argv.includes("--corps");
  const next = ranked.filter((x) => !done[keyOf(byId.get(x.id)!)] && (!onlyRead || bodyOf(byId.get(x.id)!))).slice(0, n);
  for (const { id, tier } of next) {
    const t = byId.get(id)!;
    const body = bodyOf(t)
      ?.split("\n")
      .map((l) => l.replace(SIGNED, ""))
      .join("\n");
    console.log(`\n### ${keyOf(t)} [${tier}] ${t.domaine}`);
    console.log(t.titre);
    console.log(body ? (body.length > max ? `${body.slice(0, max)}…` : body) : "(corps non trouvé : résumer d'après le titre)");
  }
}

main();
