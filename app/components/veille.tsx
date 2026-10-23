"use client";
import { useEffect, useMemo, useState } from "react";
import { downloadWorkbook, today } from "@/app/components/download";
import { Registres } from "@/app/components/registres";
import { catalogue } from "@/lib/registre/referentiel";
import { aTraiter, CHANGED, loadRegistres } from "@/lib/registre/registre";
import type { ClassificationReport } from "@/lib/report";
import { SECTORS } from "@/lib/sectors";
import { fillRegister, registerRow } from "@/lib/veille/registre";
import { type Feed, fold, type Hit, type Impact, rules, type Severity } from "@/lib/veille/watch";

const EMPTY: Feed = { updated: null, scanned: {}, hits: [] };
let feedRequest: Promise<Feed> | null = null;

/**
 * The texts the veille found (public/veille/feed.json, written by npm run veille). Fetched once,
 * when first needed, rather than carried by the page: forty years of the JORT weigh a megabyte.
 */
function fetchFeed(): Promise<Feed> {
  feedRequest ??= fetch("/veille/feed.json")
    .then((r) => (r.ok ? (r.json() as Promise<Feed>) : EMPTY))
    .catch(() => EMPTY);
  return feedRequest;
}

function useFeed(): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    let live = true;
    fetchFeed().then((f) => live && setFeed(f));
    return () => {
      live = false;
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

type Tab = "registres" | "journal";
const PAGE = 20; // texts shown at once in the Journal officiel

/** What waits in the registers of this browser (evaluations due, texts modified at the JORT), kept up to date. */
export function useVeilleCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const recount = () => fetchFeed().then((feed) => setCount(aTraiter(loadRegistres(), feed.amendments ?? [])));
    recount();
    window.addEventListener(CHANGED, recount);
    window.addEventListener("storage", recount); // another tab
    return () => {
      window.removeEventListener(CHANGED, recount);
      window.removeEventListener("storage", recount);
    };
  }, []);
  return count;
}

/**
 * The veille: the registers of the establishments (texts that apply to each, their evaluation) and
 * the JORT read issue by issue. A validated classification arrives as `seed` to start a register.
 */
export function Veille({ seed, onSeedUsed }: { seed: ClassificationReport | null; onSeedUsed: () => void }) {
  const [tab, setTab] = useState<Tab>("registres");
  const feed = useFeed();
  // Every text a register can hold: the curated référentiel and what the veille found in the JORT.
  const texts = useMemo(() => catalogue(feed?.hits ?? [], feed?.amendments ?? [], feed?.citations ?? {}), [feed]);
  useEffect(() => {
    if (seed) setTab("registres");
  }, [seed]);
  return (
    <div className="veille-tabs">
      <div className="registre-tablist" role="tablist" aria-label="Veille réglementaire">
        {(
          [
            ["registres", "Registres des établissements"],
            ["journal", "Journal officiel"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!feed ? (
        <p className="muted" role="status">
          Chargement de la veille…
        </p>
      ) : tab === "registres" ? (
        <Registres seed={seed} onSeedUsed={onSeedUsed} texts={texts} amendments={feed.amendments ?? []} />
      ) : (
        <Journal feed={feed} />
      )}
    </div>
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
            years.map(([year, numbers]) => (
              <span key={year}>
                {year} : {numbers.length} numéro{numbers.length > 1 ? "s" : ""} (jusqu’au n° {Math.max(...numbers)})
              </span>
            ))
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
