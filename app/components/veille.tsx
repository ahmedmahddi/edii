"use client";
import { useEffect, useMemo, useState } from "react";
import feedData from "@/data/veille/feed.json";
import { type Feed, fold, type Hit, type Impact, rules } from "@/lib/veille/watch";

const feed = feedData as unknown as Feed;

const IMPACTS: Record<Impact, string> = {
  nomenclature: "Nomenclature",
  addition: "Règle d’addition",
  etude: "Étude ANPE",
  procedures: "Procédures d’autorisation",
};

type Status = "a-lire" | "pertinent" | "sans-objet";
const STATUSES: Record<Status, string> = { "a-lire": "À lire", pertinent: "Pertinent", "sans-objet": "Sans objet" };
const STORAGE = "abclassement-veille-statuts";

const dateFr = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "date inconnue";

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

export function Veille() {
  const [statuses, setStatus] = useStatuses();
  const [severity, setSeverity] = useState<"all" | "critique">("all");
  const [impact, setImpact] = useState<Impact | "all">("all");
  const [status, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");

  const statusOf = (h: Hit): Status => statuses[h.id] ?? "a-lire";
  const shown = useMemo(() => {
    const q = fold(query);
    return feed.hits.filter(
      (h) =>
        (severity === "all" || h.severity === severity) &&
        (impact === "all" || h.impacts.includes(impact)) &&
        (status === "all" || (statuses[h.id] ?? "a-lire") === status) &&
        (!q || fold(`${h.title} ${h.institution ?? ""}`).includes(q)),
    );
  }, [severity, impact, status, query, statuses]);

  const years = Object.entries(feed.scanned).sort(([a], [b]) => Number(b) - Number(a));
  const critical = feed.hits.filter((h) => h.severity === "critique").length;
  const toRead = feed.hits.filter((h) => statusOf(h) === "a-lire").length;

  return (
    <div className="veille">
      <section className="veille-summary" aria-label="État de la veille">
        <div>
          <strong>{feed.hits.length}</strong>
          <span>textes repérés</span>
        </div>
        <div className={critical ? "is-critical" : ""}>
          <strong>{critical}</strong>
          <span>critiques</span>
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
              ? "Les numéros lus ne contiennent aucun texte qui touche la nomenclature, l’étude d’impact ou les procédures."
              : "Lancez la lecture du Journal Officiel depuis le dossier du projet :"}
          </p>
          <pre>npm run veille</pre>
          <p className="muted small">
            La commande lit les numéros du JORT parus depuis la dernière lecture (sommaires en français, sur lake.jort.tn), repère les
            textes qui concernent l’application et les inscrit ici.
          </p>
        </article>
      ) : (
        <>
          <div className="veille-filters" role="group" aria-label="Filtrer la veille">
            <label>
              <span>Rechercher</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titre, ministère…" />
            </label>
            <label>
              <span>Gravité</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as "all" | "critique")}>
                <option value="all">Toutes</option>
                <option value="critique">Critiques seulement</option>
              </select>
            </label>
            <label>
              <span>Concerne</span>
              <select value={impact} onChange={(e) => setImpact(e.target.value as Impact | "all")}>
                <option value="all">Toute l’application</option>
                {Object.entries(IMPACTS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
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
          <p className="muted small" aria-live="polite">
            {shown.length} texte{shown.length > 1 ? "s" : ""} affiché{shown.length > 1 ? "s" : ""}
          </p>
          <ol className="veille-list">
            {shown.map((h) => (
              <li key={h.id} className={`card veille-hit sev-${h.severity} st-${statusOf(h)}`}>
                <div className="veille-hit-head">
                  <span className={`badge veille-sev-${h.severity}`}>{h.severity === "critique" ? "Critique" : "Important"}</span>
                  <span className="veille-ref">
                    JORT n° {h.issue}/{h.year} · {dateFr(h.date)} · p. {h.page}
                  </span>
                </div>
                {h.institution ? <div className="veille-institution">{h.institution}</div> : null}
                <h3>{h.title}</h3>
                <div className="veille-why">
                  <span className="muted small">Concerne :</span>{" "}
                  {h.impacts.map((i) => (
                    <span key={i} className="badge veille-impact">
                      {IMPACTS[i]}
                    </span>
                  ))}
                </div>
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
              </li>
            ))}
          </ol>
        </>
      )}

      <article className="card veille-method">
        <h2>Comment la veille fonctionne</h2>
        <ul>
          <li>
            Chaque numéro du JORT (version française) est lu par son sommaire. Un texte est repéré quand son titre cite un texte de
            référence de l’application (<strong>critique</strong> : la nomenclature, ses modifications de 2010 et 2012, les décrets n°
            2005-1991 et n° 2006-2687) ou traite d’un de ses sujets (<strong>important</strong> :{" "}
            {rules.topics.map((t) => t.label).join(" ; ")}).
          </li>
          <li>Les nominations, délégations de signature et concours sont ignorés.</li>
          <li>
            Un repérage est une alerte à lire, pas une conclusion juridique : le texte officiel fait foi. Les statuts « pertinent » et «
            sans objet » restent dans ce navigateur.
          </li>
          <li>
            Les règles se modifient dans <code>data/veille/watch.json</code> ; <code>npm run veille</code> lit les nouveaux numéros.
          </li>
        </ul>
      </article>
    </div>
  );
}
