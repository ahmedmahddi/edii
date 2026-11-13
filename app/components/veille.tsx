"use client";
import { useEffect, useMemo, useState } from "react";
import { downloadWorkbook, today } from "@/app/components/download";
import { Signaler } from "@/app/components/signaler";
import { amendments, catalogue } from "@/lib/registre/referentiel";
import { useAmendements } from "@/app/(app)/_data/veille";
import { useRegistreList } from "@/app/(app)/_data/registres";
import { alertes, aTraiter, nouveautes } from "@/lib/registre/registre";
import { registres } from "@/lib/registre/store";
import { LIVE_CHANGED, liveIssues, saveLive } from "@/lib/veille/live-store";
import { SECTORS } from "@/lib/sectors";
import { type LiveCheck, type LiveIssue, withLive } from "@/lib/veille/live";
import { fillRegister, registerRow } from "@/lib/veille/registre";
import { type Feed, fold, type Hit, type Impact, rules, type Severity, type Sommaires } from "@/lib/veille/watch";

const EMPTY: Feed = { updated: null, scanned: {}, hits: [] };
let feedRequest: Promise<Feed> | null = null;

/**
 * Everything the veille found (public/veille/feed.json, written by npm run veille): the Journal
 * officiel screen only. The other screens read the smaller files of lib/veille/served.ts.
 */
function fetchFeed(): Promise<Feed> {
  feedRequest ??= fetch("/veille/feed.json")
    .then((r) => (r.ok ? (r.json() as Promise<Feed>) : EMPTY))
    .catch(() => EMPTY);
  return feedRequest;
}

/** The feed with the issues of the checks made in this browser: their texts and the amendments they bring. */
function merged(base: Feed, issues: LiveIssue[] = liveIssues()): Feed {
  const fresh = issues.filter((i) => i.issue && !(base.scanned[String(i.year)] ?? []).includes(i.number));
  if (!fresh.length) return base;
  const feed = withLive(base, fresh);
  const years: Sommaires[] = [...new Set(fresh.map((i) => i.year))].map((year) => ({
    year,
    issues: Object.fromEntries(fresh.filter((i) => i.year === year).map((i) => [String(i.number), i.issue!])),
  }));
  const known = new Set((base.amendments ?? []).map((a) => a.id));
  const added = amendments(years, catalogue(feed.hits)).filter((a) => !known.has(a.id));
  return { ...feed, amendments: [...(base.amendments ?? []), ...added] };
}

export function useFeed(): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetchFeed().then((f) => live && setFeed(merged(f)));
    load();
    window.addEventListener(LIVE_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(LIVE_CHANGED, load);
    };
  }, []);
  return feed;
}

const IMPACTS: Record<Impact, string> = {
  nomenclature: "Nomenclature",
  addition: "Règle d’addition",
  etude: "Étude ANPE",
  procedures: "Procédures d’autorisation",
};
const SEVERITIES: Record<Severity, string> = { critique: "Critique", important: "Important", information: "Information" };

type Status = "a-lire" | "pertinent" | "sans-objet";
const STATUSES: Record<Status, string> = { "a-lire": "À lire", pertinent: "Pertinent", "sans-objet": "Sans objet" };
const STORAGE = "abclassement-veille-statuts";

const dateFr = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "date inconnue";

/** The texts as rows of the QSE register (ID-QSE-002), as an Excel file to save. */
const exportRegister = (hits: Hit[]) =>
  downloadWorkbook((wb) => fillRegister(wb, hits.map(registerRow), new Date()), `ID-QSE-002_veille_${today()}.xlsx`);

const PAGE = 20; // texts shown at once in the Journal officiel

/** What waits in the registers (evaluations late, texts modified at the JORT), kept up to date: the menu's count. */
export function useVeilleCount(): number {
  const amendements = useAmendements();
  const list = useRegistreList();
  return useMemo(() => (amendements && list ? aTraiter(list, amendements) : 0), [amendements, list]);
}

/** The Journal officiel read issue by issue, and the check of the issues published since. */
export function Veille() {
  const feed = useFeed();
  return (
    <div className="veille-tabs">
      {!feed ? (
        <p className="muted" role="status">
          Chargement de la veille…
        </p>
      ) : (
        <>
          <Verifier feed={feed} />
          <Journal feed={feed} />
        </>
      )}
    </div>
  );
}

const SAVE: Record<string, string> = {
  enregistre: "Ils sont enregistrés : ils seront dans la veille de tous les postes après la mise à jour du site (quelques minutes).",
  deja: "Ils viennent d'être enregistrés : ils seront dans la veille de tous les postes après la mise à jour du site (quelques minutes).",
  "non-configure": "Ils sont gardés dans ce navigateur ; la lecture quotidienne les enregistrera pour tous les postes.",
  echec: "Ils sont gardés dans ce navigateur ; ils n'ont pas pu être enregistrés, la lecture quotidienne s'en chargera.",
};

type Verification =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; check: LiveCheck & { enregistrement?: string }; hits: number; important: number; news: number; alerts: number }
  | { state: "error"; message: string };

/**
 * The JORT checked at once: the issues published since the last reading are read by the server
 * (app/api/veille), their texts added to the veille and to the registers of this browser.
 */
function Verifier({ feed }: { feed: Feed }) {
  const [v, setV] = useState<Verification>({ state: "idle" });
  const recent = Object.entries(feed.scanned)
    .map(([y, numbers]) => [Number(y), Math.max(...numbers)] as const)
    .sort((a, b) => b[0] - a[0])[0];
  const lastIssue = recent ? feed.hits.find((h) => h.year === recent[0] && h.issue === recent[1])?.date : null;

  const run = async () => {
    setV({ state: "running" });
    try {
      const year = new Date().getFullYear();
      const scanned = Object.fromEntries(Object.entries(feed.scanned).filter(([y]) => Number(y) >= year - 1));
      const res = await fetch("/api/veille", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scanned }) });
      const body = (await res.json()) as (LiveCheck & { enregistrement?: string }) | { error: string };
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      // What the new issues bring: texts found, and for the registers of this browser, new texts
      // that apply and texts of theirs that are modified.
      const next = merged(feed, body.issues);
      const fresh = new Set(next.hits.filter((h) => !feed.scanned[String(h.year)]?.includes(h.issue)).map((h) => `jort-${h.id}`));
      const known = new Set((feed.amendments ?? []).map((a) => a.id));
      const added = (next.amendments ?? []).filter((a) => !known.has(a.id));
      const texts = fresh.size ? catalogue(next.hits, next.amendments ?? [], next.citations ?? {}) : [];
      const regs = registres.get();
      const news = fresh.size ? regs.reduce((n, r) => n + nouveautes(r, texts).filter((p) => fresh.has(p.texte.id)).length, 0) : 0;
      const alerts = added.length ? regs.reduce((n, r) => n + alertes(r, added).length, 0) : 0;
      const hits = fresh.size;
      const important = next.hits.filter((h) => fresh.has(`jort-${h.id}`) && h.severity !== "information").length;
      if (body.issues.length) saveLive(body);
      setV({ state: "done", check: body, hits, important, news, alerts });
    } catch (error) {
      setV({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const read = v.state === "done" ? v.check.issues.filter((i) => i.issue) : [];
  const waiting = v.state === "done" ? v.check.issues.filter((i) => !i.issue) : [];
  return (
    <section className="veille-verifier" aria-label="Vérifier le Journal officiel">
      <p className="small">
        {recent ? (
          <>
            JORT lu jusqu’au n° {recent[1]}/{recent[0]}
            {lastIssue ? ` (${dateFr(lastIssue)})` : ""}
          </>
        ) : (
          "Aucun numéro du JORT lu pour l’instant"
        )}
        {feed.updated ? <span className="muted"> · dernière lecture automatique le {dateFr(feed.updated.slice(0, 10))}</span> : null}
      </p>
      <button type="button" className="secondary-button" onClick={run} disabled={v.state === "running"}>
        {v.state === "running" ? "Lecture du JORT…" : "Vérifier maintenant"}
      </button>
      <div aria-live="polite" className="veille-verifier-result small">
        {v.state === "running" ? <p className="muted">Lecture des numéros parus depuis, sur jort.tn (jusqu’à une minute)…</p> : null}
        {v.state === "error" ? <p className="registre-warning">Le JORT n’a pas pu être lu : {v.message}. Réessayez plus tard.</p> : null}
        {v.state === "done" ? (
          read.length || waiting.length ? (
            <>
              <p>
                {read.length
                  ? `${read.length} nouveau${read.length > 1 ? "x" : ""} numéro${read.length > 1 ? "s" : ""} lu${read.length > 1 ? "s" : ""} (n° ${read.map((i) => i.number).join(", ")}) : `
                  : ""}
                {read.length ? (
                  <strong>
                    {v.hits} texte{v.hits > 1 ? "s" : ""} repéré{v.hits > 1 ? "s" : ""}
                    {v.hits ? `, dont ${v.important} important${v.important > 1 ? "s" : ""}` : ""}
                  </strong>
                ) : null}
                {read.length && (v.news || v.alerts)
                  ? ` · pour vos registres : ${[v.news ? `${v.news} nouveau${v.news > 1 ? "x" : ""} texte${v.news > 1 ? "s" : ""}` : "", v.alerts ? `${v.alerts} texte${v.alerts > 1 ? "s" : ""} modifié${v.alerts > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ")}.`
                  : read.length
                    ? " · rien de nouveau pour vos registres."
                    : ""}
              </p>
              {waiting.length ? (
                <p className="muted">
                  Publié{waiting.length > 1 ? "s" : ""} mais pas encore lisible{waiting.length > 1 ? "s" : ""} (texte en préparation sur ocr.jort.tn) : n° {waiting.map((i) => `${i.number}/${i.year}`).join(", ")}.
                </p>
              ) : null}
              {v.check.remaining ? <p className="muted">{v.check.remaining} autre(s) numéro(s) à lire : vérifiez à nouveau.</p> : null}
              {read.length && v.check.enregistrement && SAVE[v.check.enregistrement] ? <p className="muted">{SAVE[v.check.enregistrement]}</p> : null}
            </>
          ) : (
            <p>Aucun nouveau numéro : la veille est à jour.</p>
          )
        ) : null}
      </div>
    </section>
  );
}

/** Statuses are this browser's own reading notes: kept in localStorage, never sent anywhere. */
function useStatuses(): [Record<string, Status>, (id: string, s: Status) => void] {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  useEffect(() => {
    try {
      setStatuses(JSON.parse(localStorage.getItem(STORAGE) ?? "{}"));
    } catch {
      // private window or blocked storage: start empty
    }
  }, []);
  const set = (id: string, s: Status) =>
    setStatuses((prev) => {
      const next = { ...prev, [id]: s };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        // the choice still holds for this visit
      }
      return next;
    });
  return [statuses, set];
}

function Journal({ feed }: { feed: Feed }) {
  const [statuses, setStatus] = useStatuses();
  const [level, setLevel] = useState<"all" | "critique" | "important">("all");
  const [domain, setDomain] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [status, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const statusOf = (h: Hit): Status => statuses[h.id] ?? "a-lire";
  const shown = useMemo(() => {
    const q = fold(query);
    return feed.hits.filter(
      (h) =>
        (level === "all" || (level === "critique" ? h.severity === "critique" : h.severity !== "information")) &&
        (domain === "all" || h.domains.includes(domain)) &&
        (sector === "all" || h.sectors.includes(sector)) &&
        (status === "all" || (statuses[h.id] ?? "a-lire") === status) &&
        (!q || fold(`${h.title} ${h.institution ?? ""}`).includes(q)),
    );
  }, [feed, level, domain, sector, status, query, statuses]);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [level, domain, sector, status, query]); // a new filter starts from the top
  const visible = shown.slice(0, limit);

  const years = Object.entries(feed.scanned).sort(([a], [b]) => Number(b) - Number(a));
  const count = (s: Severity) => feed.hits.filter((h) => h.severity === s).length;
  const toRead = feed.hits.filter((h) => statusOf(h) === "a-lire").length;
  const sectorsSeen = Object.keys(SECTORS).filter((c) => feed.hits.some((h) => h.sectors.includes(c)));
  const domainsSeen = Object.keys(rules.domains).filter((d) => feed.hits.some((h) => h.domains.includes(d)));

  return (
    <div className="veille">
      <section className="veille-summary" aria-label="État de la veille">
        <div className={count("critique") ? "is-critical" : ""}>
          <strong>{count("critique")}</strong>
          <span>critiques</span>
        </div>
        <div>
          <strong>{count("important")}</strong>
          <span>importants</span>
        </div>
        <div>
          <strong>{toRead}</strong>
          <span>à lire</span>
        </div>
        <div className="veille-coverage">
          <span>Numéros du JORT lus</span>
          {years.length ? (
            <>
              <span>
                {years
                  .slice(0, 3)
                  .map(([year, numbers]) => `${year} : ${numbers.length} (jusqu’au n° ${Math.max(...numbers)})`)
                  .join(" · ")}
              </span>
              {years.length > 3 ? (
                <details className="veille-years">
                  <summary>
                    et {years.length - 3} année{years.length - 3 > 1 ? "s" : ""} avant, depuis {years.at(-1)![0]}
                  </summary>
                  <span>
                    {years
                      .slice(3)
                      .map(([year, numbers]) => `${year} : ${numbers.length}`)
                      .join(" · ")}
                  </span>
                </details>
              ) : null}
            </>
          ) : (
            <span>aucun pour l’instant</span>
          )}
          {feed.updated ? <span className="muted small">Mise à jour le {dateFr(feed.updated.slice(0, 10))}</span> : null}
        </div>
      </section>

      {!feed.hits.length ? (
        <article className="card veille-empty">
          <h2>{years.length ? "Aucun texte à signaler" : "La veille n’a pas encore été lancée"}</h2>
          <p>
            {years.length
              ? "Les numéros lus ne contiennent aucun texte sur les domaines suivis."
              : "Lancez la lecture du Journal Officiel depuis le dossier du projet :"}
          </p>
          <pre>npm run veille</pre>
          <p className="muted small">
            La commande lit les numéros du JORT parus depuis la dernière lecture (sommaires en français, sur lake.jort.tn), repère les
            textes des domaines suivis et les inscrit ici.
          </p>
        </article>
      ) : (
        <>
          <div className="veille-filters" role="group" aria-label="Filtrer la veille">
            <label className="veille-search">
              <span>Rechercher</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titre, ministère…" />
            </label>
            <label>
              <span>Domaine</span>
              <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="all">Tous les domaines</option>
                {domainsSeen.map((d) => (
                  <option key={d} value={d}>
                    {rules.domains[d]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Secteur</span>
              <select value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="all">Tous les secteurs</option>
                {sectorsSeen.map((c) => (
                  <option key={c} value={c}>
                    {c} · {SECTORS[c][0]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Niveau</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
                <option value="all">Tous</option>
                <option value="important">Critiques et importants</option>
                <option value="critique">Critiques seulement</option>
              </select>
            </label>
            <label>
              <span>Statut</span>
              <select value={status} onChange={(e) => setStatusFilter(e.target.value as Status | "all")}>
                <option value="all">Tous</option>
                {Object.entries(STATUSES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="veille-toolbar">
            <p className="muted small" aria-live="polite">
              {shown.length} texte{shown.length > 1 ? "s" : ""} affiché{shown.length > 1 ? "s" : ""} sur {feed.hits.length}
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={!shown.length || exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportRegister(shown);
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "Préparation du fichier…" : "Exporter vers le registre (Excel)"}
            </button>
          </div>
          <ol className="veille-list">
            {visible.map((h) => (
              <li key={h.id} className={`card veille-hit sev-${h.severity} st-${statusOf(h)}`}>
                {/* One line per text; its details open on demand: the JORT lists hundreds. */}
                <details>
                  <summary>
                    <span className="veille-hit-head">
                      <span className={`badge veille-sev-${h.severity}`}>{SEVERITIES[h.severity]}</span>
                      <span className="veille-ref">
                        JORT n° {h.issue}/{h.year} · {dateFr(h.date)} · p. {h.page}
                      </span>
                      {statusOf(h) !== "a-lire" ? <span className="badge veille-status">{STATUSES[statusOf(h)]}</span> : null}
                    </span>
                    <span className="veille-hit-title" dir="auto">
                      {h.title}
                    </span>
                  </summary>
                {h.institution ? (
                  <div className="veille-institution" dir="auto">
                    {h.institution}
                  </div>
                ) : null}
                <dl className="veille-tags">
                  <div>
                    <dt>Domaine</dt>
                    <dd>
                      {h.domains.map((d) => (
                        <span key={d} className="badge veille-domain">
                          {rules.domains[d] ?? d}
                        </span>
                      ))}
                    </dd>
                  </div>
                  {h.sectors.length ? (
                    <div>
                      <dt>Secteurs</dt>
                      <dd>
                        {h.sectors.map((c) => (
                          <span key={c} className="badge veille-sector">
                            {c} · {SECTORS[c]?.[0] ?? c}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                  {h.impacts.length ? (
                    <div>
                      <dt>Dans l’application</dt>
                      <dd>
                        {h.impacts.map((i) => (
                          <span key={i} className="badge veille-impact">
                            {IMPACTS[i]}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <ul className="veille-rules small">
                  {h.matches.map((m) => (
                    <li key={m.rule}>
                      {m.label} <span className="muted">({m.terms.join(", ")})</span>
                    </li>
                  ))}
                </ul>
                <div className="veille-actions">
                  <a href={h.pdf} target="_blank" rel="noreferrer">
                    Lire au JORT, p. {h.page} →
                  </a>
                  <label>
                    <span className="visually-hidden">Statut de lecture</span>
                    <select value={statusOf(h)} onChange={(e) => setStatus(h.id, e.target.value as Status)}>
                      {Object.entries(STATUSES).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Signaler texteId={`jort-${h.id}`} titre={h.title} compact />
                </div>
                </details>
              </li>
            ))}
          </ol>
          {shown.length > visible.length ? (
            <button type="button" className="secondary-button veille-more" onClick={() => setLimit(limit + PAGE)}>
              Afficher {Math.min(PAGE, shown.length - visible.length)} textes de plus ({shown.length - visible.length} restants)
            </button>
          ) : null}
        </>
      )}

      <details className="card veille-method">
        <summary>Comment la veille fonctionne</summary>
        <p>
          Chaque numéro du JORT (version française) est lu par son sommaire. Un texte est repéré quand son titre, sans l’autorité qui le
          signe, traite d’un des domaines suivis :
        </p>
        <dl className="veille-domains">
          {Object.entries(rules.domains).map(([id, label]) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>
                {rules.rules
                  .filter((r) => r.domain === id)
                  .map((r) => r.label)
                  .join(" · ")}
              </dd>
            </div>
          ))}
        </dl>
        <ul>
          <li>
            <strong>Critique</strong> : le titre cite un texte de référence de l’application (la nomenclature du 15 novembre 2005, ses
            modifications de 2010 et 2012, les décrets n° 2005-1991, n° 2006-2687 et n° 68-88). <strong>Important</strong> : une
            obligation pour les entreprises. <strong>Information</strong> : l’actualité d’un secteur, un accord international, un
            acte ponctuel.
          </li>
          <li>
            Sont ignorés : nominations, concours et carrière des agents publics, budget et comptes de l’État, prêts et garanties de
            l’État, permis miniers et pétroliers, expropriations, fixations de prix, prix et médailles.
          </li>
          <li>
            Un repérage est une alerte à lire, pas une conclusion juridique : le texte officiel fait foi. Les statuts « pertinent » et «
            sans objet » restent dans ce navigateur.
          </li>
          <li>
            « Exporter vers le registre » enregistre les textes affichés comme lignes du registre de veille ID-QSE-002 (système,
            domaine, type, référence, titre avec lien vers le JORT, fréquence d’évaluation) ; le résumé de l’exigence, la conformité,
            le risque et le plan d’action restent à remplir. Filtrez sur le statut « Pertinent » pour n’exporter que les textes retenus.
          </li>
          <li>
            Les règles se modifient dans <code>data/veille/watch.json</code> ; <code>npm run veille -- --reassess</code> les applique
            aux numéros déjà lus, <code>npm run veille</code> lit les nouveaux.
          </li>
        </ul>
      </details>
    </div>
  );
}
