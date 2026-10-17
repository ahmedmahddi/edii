"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  additionGroup,
  type Classe,
  describe,
  type Item,
  nomenclature,
  type Rubrique,
  rubrique,
  search,
  variants,
} from "@/lib/classify";
import {
  type Activity,
  type ActivityResult,
  type AdditionResult,
  classifyEstablishment,
  decodeActivities,
  encodeActivities,
  type EstablishmentResult,
  fmtRatio,
} from "@/lib/establishment";
import {
  eie,
  eieEntry,
  entriesFor,
  establishmentStudy,
  SITUATIONS,
  type Situation,
  type StudyKind,
} from "@/lib/studies";
import { useVeilleCount, Veille } from "./components/veille";
import { SECTORS } from "@/lib/sectors";

import {
  categoryLabel,
  createClassificationReport,
  reportFingerprint,
  type ClassificationReport,
} from "@/lib/report";
import { ClassificationReportView } from "./components/classification-report";

const LABEL: Record<string, string> = {
  "1": "1ère catégorie",
  "2": "2ème catégorie",
  "3": "3ème catégorie",
  NC: "Non classé",
};
const SOURCE = Object.fromEntries(nomenclature.sources.map((s) => [s.id, s]));
const ordinal = (c: Classe) =>
  c === "NC" ? "non classé" : `${c}${c === 1 ? "ère" : "ème"}`;

function ClasseBadge({ classe, big }: { classe: Classe; big?: boolean }) {
  return (
    <span className={`badge edii-c${classe} ${big ? "edii-big" : ""}`}>
      {LABEL[String(classe)]}
    </span>
  );
}

export default function EdiiPage() {
  return (
    <Suspense fallback={<div className="center muted">Chargement…</div>}>
      <Edii />
    </Suspense>
  );
}

type View = "search" | "establishment" | "guide" | "sources" | "veille" | "report";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V7l8-4v18M12 9h8v12M2 21h20M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2" />
      </>
    ),
    book: (
      <>
        <path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v15" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    leaf: (
      <>
        <path d="M20 3C10 2 3 6 5 14c3 8 15 4 15-11Z M4 21 15 10" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 16v1" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="15" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="15" width="6" height="6" rx="1" />
        <rect x="15" y="15" width="6" height="6" rx="1" />
      </>
    ),
    bell: (
      <>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.building}
    </svg>
  );
}

function Edii() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [section, setSection] = useState<string | null>(null);
  const [code, setCode] = useState(params.get("code"));
  const [activities, setActivities] = useState<Activity[]>(() =>
    decodeActivities(params.get("e")),
  );
  const [view, setView] = useState<View>("search");
  const [notice, setNotice] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [report, setReport] = useState<ClassificationReport | null>(null);
  // A validated classification on its way to the veille, to start the establishment's register.
  const [registreSeed, setRegistreSeed] = useState<ClassificationReport | null>(null);
  const seedUsed = useCallback(() => setRegistreSeed(null), []);
  const veilleCount = useVeilleCount();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const validationRef = useRef<HTMLDivElement>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [situation, setSituation] = useState<Situation>(() => {
    const s = params.get("s");
    return s && s in SITUATIONS ? (s as Situation) : "projet";
  });
  const [sensitive, setSensitive] = useState(params.get("z") === "1");
  const reportStale =
    !!report &&
    report.fingerprint !==
      reportFingerprint(activities, situation, sensitive, establishmentName);
  useEffect(() => {
    if (report) {
      reportRef.current?.focus({ preventScroll: true });
      reportRef.current?.scrollIntoView({ block: "start" });
    }
  }, [report]);
  useEffect(() => {
    setValidationErrors([]);
  }, [activities, situation, sensitive]);
  const validate = () => {
    const result = createClassificationReport(
      activities,
      situation,
      sensitive,
      establishmentName,
    );
    if (!result.ok) {
      setValidationErrors(result.issues);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setValidationErrors([]);
    setReport(result.report);
    setView("report");
    window.scrollTo({ top: 0 });
  };
  const startRegister = () => {
    if (!report) return;
    setRegistreSeed(report);
    setView("veille");
    window.scrollTo({ top: 0 });
  };
  const selected = rubrique(code ?? "");
  const est = useMemo(() => classifyEstablishment(activities), [activities]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (activities.length) p.set("e", encodeActivities(activities));
    if (activities.length && situation !== "projet") p.set("s", situation);
    if (activities.length && sensitive) p.set("z", "1");
    if (query.trim()) p.set("q", query.trim());
    router.replace(p.size ? `/?${p}` : "/", { scroll: false });
  }, [code, activities, situation, sensitive, query, router]);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (selected && view === "search") {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: "start" });
    }
  }, [code, view, selected]);
  const results = useMemo(
    () =>
      query.trim()
        ? search(query, 60)
        : section
          ? nomenclature.rubriques.filter((r) => r.section === section)
          : [],
    [query, section],
  );
  const open = (c: string) => {
    setCode(c);
    setView("search");
  };
  const add = (c: string) => {
    setActivities((list) => [...list, { code: c }]);
    setNotice(`Rubrique ${c} ajoutée à votre établissement`);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  };
  const update = (i: number, patch: Partial<Activity>) =>
    setActivities((list) =>
      list.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    );
  const remove = (i: number) =>
    setActivities((list) => list.filter((_, j) => j !== i));
  const count = (c: string) => activities.filter((a) => a.code === c).length;
  const nav: [View, string, string][] = [
    ["search", "search", "Rechercher une activité"],
    ["establishment", "building", "Mon établissement"],
    ["guide", "help", "Mode d’emploi"],
    ["sources", "book", "Textes de référence"],
    ["veille", "bell", "Veille réglementaire"],
  ];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Aller au contenu
      </a>
      <div className="app-body">
        <div className="utility-bar">
          <span>
            ABC CONSULTING <span className="utility-separator">/</span> OUTILS
            MÉTIERS
          </span>
          <span>Tunisie · Classement des établissements</span>
        </div>
        <header className="site-header">
          <div className="masthead">
            <a className="brand" href="/" aria-label="ABClassement — Accueil">
              <span className="wordmark">
                <span>ABC</span>lassement<span className="brand-period">.</span>
              </span>
              <span className="brand-caption">Classement & environnement</span>
            </a>
            <div className="company-signature">
              <span>Un outil développé par</span>
              <img
                src="/brand/abc-consulting.jpg"
                alt="ABC Consulting"
                width="763"
                height="366"
              />
            </div>
          </div>
          <nav className="primary-nav" aria-label="Navigation principale">
            {nav.map(([id, icon, label]) => (
              <button
                key={id}
                className={view === id || (id === "establishment" && view === "report") ? "active" : ""}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                <Icon name={icon} size={18} />
                <span>{id === "search" ? "Nomenclature" : label}</span>
                {id === "establishment" && (
                  <span className="nav-count">{activities.length}</span>
                )}
                {id === "veille" && veilleCount > 0 && (
                  <span
                    className="nav-count is-alert"
                    title="Dans vos registres : textes modifiés au JORT, évaluations en retard ou à faire sous 30 jours"
                  >
                    {veilleCount}
                  </span>
                )}
              </button>
            ))}
            <span className="nav-reference">
              Référentiel 2005 · 2010 · 2012
            </span>
          </nav>
        </header>
        <main id="workspace" className="workspace" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "search"
                  ? "NOMENCLATURE TUNISIENNE"
                  : "ABCLASSEMENT / " +
                    (view === "establishment"
                      ? "VOTRE DOSSIER"
                      : view === "report"
                        ? "SYNTHÈSE"
                      : view === "guide"
                        ? "MODE D’EMPLOI"
                        : view === "veille"
                          ? "VEILLE RÉGLEMENTAIRE"
                          : "DOCUMENTATION")}
              </div>
              <h1>
                {view === "search"
                  ? "Répertoire des activités"
                  : view === "establishment"
                    ? "Mon établissement"
                    : view === "report"
                      ? "Synthèse de classement"
                      : view === "guide"
                      ? "Comprendre votre classement"
                      : view === "veille"
                        ? "Veille réglementaire"
                        : "Textes de référence"}
              </h1>
              <p>
                {view === "search"
                  ? "Trouvez vos activités et leurs seuils de classement."
                  : view === "establishment"
                    ? "Vos activités, leur catégorie et l’étude ANPE."
                    : view === "report"
                      ? "La synthèse de votre classement, à imprimer ou à exporter."
                      : view === "veille"
                        ? "Les registres de vos établissements et les textes du Journal officiel qui les concernent."
                        : "Les informations utiles pour préparer votre dossier."}
              </p>
            </div>
            <div className="reference-total">
              <strong>{nomenclature.rubriques.length}</strong>
              <span>
                rubriques
                <br />
                de référence
              </span>
            </div>
          </div>
          {view === "guide" ? (
            <Intro />
          ) : view === "sources" ? (
            <Sources />
          ) : view === "veille" ? (
            <Veille seed={registreSeed} onSeedUsed={seedUsed} />
          ) : view === "report" ? null : (
            <div className={`edii-layout view-${view}`}>
              <section
                className="search-workspace"
                aria-label="Recherche et nomenclature"
              >
                <div className="search-panel card">
                  <div className="section-heading">
                    <h2>Rechercher une activité</h2>
                    <span className="quiet-label">Par mot-clé ou numéro</span>
                  </div>
                  <label htmlFor="activity-search" className="search-label">
                    Une activité, une substance ou un numéro de rubrique
                  </label>
                  <div className="search-field">
                    <Icon name="search" size={23} />
                    <input
                      id="activity-search"
                      type="search"
                      placeholder="Ex. : lait, stockage, 1214…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCode(null);
                      }}
                    />
                    {query && (
                      <button
                        className="clear-search"
                        onClick={() => {
                          setQuery("");
                          document.getElementById("activity-search")?.focus();
                        }}
                        aria-label="Effacer la recherche"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {!query.trim() && !section && (
                    <div className="search-examples">
                      Essayez{" "}
                      <button onClick={() => setQuery("lait")}>lait</button>
                      <button onClick={() => setQuery("bois")}>bois</button>
                      <button onClick={() => setQuery("inflammables")}>
                        inflammables
                      </button>
                    </div>
                  )}
                  {selected && (
                    <div
                      ref={detailRef}
                      className="rubrique-detail"
                      tabIndex={-1}
                      aria-label="Détail de la rubrique"
                    >
                      <button
                        className="back-button"
                        onClick={() => setCode(null)}
                      >
                        ← Fermer le détail de la rubrique
                      </button>
                      <RubriqueView
                        key={selected.code}
                        rub={selected}
                        count={count(selected.code)}
                        onAdd={() => add(selected.code)}
                        onOpen={open}
                      />
                    </div>
                  )}
                  {query.trim() || section ? (
                    <>
                      <div className="results-heading">
                        <h3>
                          {query.trim()
                            ? "Résultats de recherche"
                            : SECTORS[section!]?.[0]}
                        </h3>
                        <span role="status">
                          {results.length}
                          {query.trim() && results.length === 60
                            ? "+"
                            : ""}{" "}
                          rubrique{results.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      {section && (
                        <button
                          className="back-button"
                          onClick={() => {
                            setSection(null);
                            setCode(null);
                          }}
                        >
                          ← Tous les secteurs
                        </button>
                      )}
                      {!results.length && (
                        <div className="empty-search">
                          <Icon name="search" size={30} />
                          <h3>Aucune rubrique trouvée</h3>
                          <p>
                            Essayez un autre mot : le produit, la substance ou
                            le procédé utilisé.
                          </p>
                          <p className="muted small">
                            Une activité absente de la nomenclature peut être
                            non classée. Vérifiez avec d’autres termes avant de
                            conclure.
                          </p>
                        </div>
                      )}
                      <ul className="edii-results">
                        {results.map((r) => (
                          <li key={r.code}>
                            <button
                              className={`edii-open ${selected?.code === r.code ? "on" : ""}`}
                              aria-expanded={selected?.code === r.code}
                              onClick={() => open(r.code)}
                            >
                              <span className="rubrique-code">{r.code}</span>
                              <span>
                                {r.title}
                                {r.kind === "definition" && (
                                  <span className="tag">Définition</span>
                                )}
                              </span>
                              <Icon name="arrow" size={18} />
                            </button>
                            {r.kind === "activity" && (
                              <button
                                className={`edii-add ${count(r.code) ? "added" : ""}`}
                                aria-label={`Ajouter ${r.code} à l’établissement`}
                                onClick={() => add(r.code)}
                              >
                                <Icon
                                  name={count(r.code) ? "check" : "plus"}
                                  size={18}
                                />
                                <span>
                                  {count(r.code)
                                    ? `Ajoutée${count(r.code) > 1 ? ` (${count(r.code)})` : ""}`
                                    : "Ajouter"}
                                </span>
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : selected ? null : (
                    <>
                      <div className="browse-heading">
                        <h3>Parcourir la nomenclature</h3>
                        <span>15 secteurs</span>
                      </div>
                      <div className="category-columns">
                        <section
                          className="sector-category"
                          aria-label="Secteurs d’activité"
                        >
                          <h3>
                            <span>01</span> Activités
                          </h3>
                          <div className="sector-grid">
                            {Object.entries(SECTORS)
                              .filter(([c]) => c.startsWith("1"))
                              .map(([c, [title, description]]) => (
                                <button
                                  className="sector-card"
                                  key={c}
                                  onClick={() => setSection(c)}
                                >
                                  <span className="sector-code">{c}</span>
                                  <span>
                                    <strong>{title}</strong>
                                    <small>{description}</small>
                                  </span>
                                  <Icon name="arrow" size={16} />
                                </button>
                              ))}
                          </div>
                        </section>
                        <section
                          className="sector-category"
                          aria-label="Familles de substances"
                        >
                          <h3>
                            <span>02</span> Substances
                          </h3>
                          <div className="substance-grid">
                            {Object.entries(SECTORS)
                              .filter(([c]) => c.startsWith("2"))
                              .map(([c, [title, description]]) => (
                                <button
                                  className="sector-card"
                                  key={c}
                                  onClick={() => setSection(c)}
                                >
                                  <span className="sector-code">{c}</span>
                                  <span>
                                    <strong>{title}</strong>
                                    <small>{description}</small>
                                  </span>
                                  <Icon name="arrow" size={16} />
                                </button>
                              ))}
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                </div>
                <div className="reference-note">
                  <Icon name="book" size={19} />
                  <p>
                    Nomenclature de 2005, consolidée avec les modifications de
                    2010 et 2012.
                    <br />
                    <button
                      className="edii-link"
                      onClick={() => setView("sources")}
                    >
                      Consulter les textes de référence{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </p>
                </div>
              </section>
              <section
                className="dossier-workspace"
                aria-label="Mon établissement"
              >
                {activities.length ? (
                  <>
                    <EstablishmentCard
                      est={est}
                      update={update}
                      remove={remove}
                      clear={() => {
                        if (
                          confirm(
                            `Retirer ${activities.length > 1 ? `les ${activities.length} activités` : "l’activité"} de l’établissement ? Les quantités et les choix ANPE seront perdus.`,
                          )
                        )
                          setActivities([]);
                      }}
                      open={open}
                    />
                    <StudyCard
                      activities={activities}
                      situation={situation}
                      sensitive={sensitive}
                      setSituation={setSituation}
                      setSensitive={setSensitive}
                      update={update}
                    />
                    {report && (
                      <div className={`card report-summary${reportStale ? " is-stale" : ""}`}>
                        <div>
                          <p className="eyebrow">Synthèse validée</p>
                          <strong>
                            {categoryLabel(report.establishment.classe)}
                            {report.environment.study ? ` · ${report.environment.study.title}` : ""}
                          </strong>
                          <p className="small">
                            {reportStale
                              ? "Le dossier a changé depuis : validez à nouveau pour mettre la synthèse à jour."
                              : `${report.name || "Établissement sans nom"} · générée le ${new Date(report.generatedAt).toLocaleDateString("fr-FR")}`}
                          </p>
                        </div>
                        <div className="report-summary-actions">
                          <button
                            className="secondary-button"
                            onClick={() => {
                              setView("report");
                              window.scrollTo({ top: 0 });
                            }}
                          >
                            Voir la synthèse
                          </button>
                          <button disabled={reportStale} onClick={startRegister}>
                            Créer le registre de veille
                          </button>
                        </div>
                      </div>
                    )}
                    <div
                      id="dossier-validation"
                      className="validation-panel"
                      ref={validationRef}
                      tabIndex={-1}
                    >
                      <h2>Valider et préparer le rapport</h2>
                      <p>
                        Confirmez vos activités et vos choix ANPE pour générer
                        une synthèse complète, avec tous les cas et seuils.
                      </p>
                      <label htmlFor="establishment-name">
                        Nom de l’établissement <span>(facultatif)</span>
                      </label>
                      <input
                        id="establishment-name"
                        maxLength={180}
                        value={establishmentName}
                        onChange={(e) => setEstablishmentName(e.target.value)}
                        placeholder="Nom à afficher sur le rapport"
                      />
                      {validationErrors.length > 0 && (
                        <div className="validation-errors" role="alert">
                          <strong>
                            Informations à compléter avant la validation
                          </strong>
                          <ul>
                            {validationErrors.map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button className="validate-button" onClick={validate}>
                        Valider et générer la synthèse{" "}
                        <Icon name="arrow" size={18} />
                      </button>
                      <small>
                        La synthèse s’ouvre sur sa propre page : imprimable en
                        PDF, exportable en HTML et en données JSON.
                      </small>
                    </div>
                    <button
                      className="secondary-button add-another"
                      onClick={() => {
                        setView("search");
                        document.getElementById("activity-search")?.focus();
                      }}
                    >
                      <Icon name="plus" size={18} /> Ajouter une autre activité
                    </button>
                  </>
                ) : (
                  <div className="card dossier-empty">
                    <div className="section-heading">
                      <h2>Mon établissement</h2>
                      <span className="nav-count">0</span>
                    </div>
                    <div className="dossier-placeholder">
                      <span className="dossier-index">DOSSIER / 00</span>
                      <h3>Aucune activité sélectionnée</h3>
                      <p>
                        Recherchez une rubrique et utilisez « Ajouter » pour
                        commencer votre classement.
                      </p>
                    </div>
                    <div className="preparation-note">
                      <h3>Les informations à préparer</h3>
                      <ul>
                        <li>Les activités exercées sur votre site</li>
                        <li>Les capacités ou quantités présentes</li>
                        <li>La situation de votre établissement</li>
                      </ul>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setView("search");
                        document.getElementById("activity-search")?.focus();
                      }}
                    >
                      Rechercher une activité <Icon name="arrow" size={17} />
                    </button>
                  </div>
                )}
                <div className="help-card">
                  <span className="help-icon">
                    <Icon name="help" size={22} />
                  </span>
                  <div>
                    <h3>Aide au classement</h3>
                    <p>Consultez les étapes et les règles de classement.</p>
                    <button
                      className="edii-link"
                      onClick={() => setView("guide")}
                    >
                      Découvrir le mode d’emploi{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
                <div className="trust-note">
                  <Icon name="shield" size={18} />
                  <p>
                    Un outil d’aide à la décision.
                    <br />
                    Le texte officiel fait foi.
                  </p>
                </div>
              </section>
            </div>
          )}
          {view === "report" && !report && (
            <div className="card dossier-empty">
              <p>Aucune synthèse : validez d’abord votre établissement.</p>
              <button className="secondary-button" onClick={() => setView("establishment")}>
                Aller à Mon établissement
              </button>
            </div>
          )}
          {report && view === "report" && (
            <div
              ref={reportRef}
              className="report-host"
              tabIndex={-1}
              aria-label="Rapport de classement généré"
            >
              <button className="edii-link report-back" onClick={() => setView("establishment")}>
                <span aria-hidden="true">←</span> Revenir au dossier
              </button>
              <section className="card registre-next" aria-labelledby="registre-next-title">
                <div>
                  <p className="eyebrow">Étape suivante</p>
                  <h2 id="registre-next-title">La veille réglementaire de cet établissement</h2>
                  <p>
                    Les textes qui s’appliquent selon la catégorie, les rubriques et l’étude ANPE sont proposés d’office ; complétez le
                    profil du site, puis évaluez la conformité texte par texte.
                  </p>
                </div>
                <button disabled={reportStale} onClick={startRegister}>
                  Créer le registre de veille <Icon name="arrow" size={18} />
                </button>
                {reportStale ? (
                  <small>Validez à nouveau la synthèse : le dossier a changé depuis.</small>
                ) : null}
              </section>
              <ClassificationReportView
                key={report.generatedAt}
                report={report}
                stale={reportStale}
              />
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              ABClassement <span>—</span> ABC Consulting
            </span>
            <button onClick={() => setView("sources")}>
              À propos du référentiel <span aria-hidden="true">→</span>
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {nav.map(([id, icon]) => (
          <button
            key={id}
            onClick={() => {
              setView(id);
              window.scrollTo({ top: 0 });
            }}
            aria-current={view === id ? "page" : undefined}
            className={view === id || (id === "establishment" && view === "report") ? "active" : ""}
          >
            <Icon name={icon} />
            <span>
              {id === "search"
                ? "Recherche"
                : id === "establishment"
                  ? `Établissement (${activities.length})`
                  : id === "guide"
                    ? "Guide"
                    : id === "veille"
                      ? veilleCount
                        ? `Veille (${veilleCount})`
                        : "Veille"
                      : "Textes"}
            </span>
          </button>
        ))}
      </nav>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && (
          <div className="toast">
            <Icon name="check" size={19} />
            <span>{notice}</span>
            <button
              onClick={() => {
                setView("establishment");
                setNotice("");
                window.scrollTo({ top: 0 });
              }}
            >
              Voir
            </button>
            <button
              aria-label="Fermer la notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <article className="card guide-card">
      <div className="eyebrow">MODE D’EMPLOI</div>
      <h2>Utiliser ABClassement</h2>
      <ol className="guide-steps">
        <li>
          <h3>Recherchez toutes vos activités</h3>
          <p>
            Entrez une activité, une substance ou un numéro de rubrique. Vous
            pouvez aussi parcourir les secteurs. Ouvrez une rubrique pour
            consulter ses cas et ses seuils.
          </p>
        </li>
        <li>
          <h3>Construisez votre établissement</h3>
          <p>
            Utilisez « Ajouter », puis ouvrez « Mon établissement ». Choisissez
            le cas correspondant et saisissez la quantité avec son unité.
            Ajoutez chaque activité présente sur votre site.
          </p>
        </li>
        <li>
          <h3>Consultez votre résultat</h3>
          <p>
            La catégorie la plus élevée détermine le classement de
            l’établissement. La règle d’addition est appliquée aux substances
            d’un même groupe. Pour l’étude environnementale, précisez votre
            situation et choisissez une entrée du décret pour chaque activité.
          </p>
        </li>
      </ol>
      <div className="edii-note">
        Vous pouvez conserver ou partager l’adresse de la page : elle contient
        les activités et les paramètres de votre classement.
      </div>
      <p className="small muted">
        Cet outil aide à lire la nomenclature. Les textes officiels font foi.
      </p>
    </article>
  );
}

function Sources() {
  return (
    <article className="card sources-card">
      <div className="eyebrow">LE RÉFÉRENTIEL</div>
      <h2>Documents du référentiel</h2>
      <p className="muted">
        La nomenclature intègre le texte de base de 2005 et ses modifications de
        2010 et 2012.
      </p>
      {nomenclature.sources.map((s) => (
        <div className="source-item" key={s.id}>
          <span className="source-year">{s.id}</span>
          <div>
            <h3>{s.title}</h3>
            <p className="muted small">{s.jort}</p>
            <span className="tag">
              {s.role === "base" ? "Texte de base" : "Modification"}
            </span>
          </div>
        </div>
      ))}
      <div className="source-item">
        <span className="source-year">ANPE</span>
        <div>
          <h3>Décret n° 2005-1991 du 11 juillet 2005</h3>
          <p className="muted">
            Études d’impact sur l’environnement et cahiers des charges.
          </p>
        </div>
      </div>
      <div className="source-item">
        <span className="source-year">EDII</span>
        <div>
          <h3>Décret n° 2006-2687 du 9 octobre 2006</h3>
          <p className="muted">
            Procédures d’ouverture et d’exploitation des établissements
            dangereux, insalubres ou incommodes.
          </p>
        </div>
      </div>
      <p className="edii-note">
        Les seuils ont été extraits des publications au JORT puis vérifiés. En
        cas de doute, consultez le texte officiel et l’administration
        compétente.
      </p>
    </article>
  );
}

function EstablishmentCard({
  est,
  update,
  remove,
  clear,
  open,
}: {
  est: EstablishmentResult;
  update: (i: number, patch: Partial<Activity>) => void;
  remove: (i: number) => void;
  clear: () => void;
  open: (code: string) => void;
}) {
  return (
    <div className="card edii-est">
      <div className="edii-head">
        <h2>
          Mon établissement{" "}
          <span className="nav-count">{est.results.length}</span>
        </h2>
        <button className="ghost small" onClick={clear}>
          Tout retirer
        </button>
      </div>

      <div className="edii-verdict">
        {est.classe === null ? (
          <span className="muted">
            Compléter les activités pour obtenir le classement.
          </span>
        ) : (
          <>
            <ClasseBadge classe={est.classe} big />
            <div>
              {est.complete ? (
                <span>
                  Catégorie de l&apos;établissement, déterminée par{" "}
                  {listFr(est.decidedBy)}.
                </span>
              ) : (
                <span>
                  Au moins cette catégorie (par {listFr(est.decidedBy)}) : des
                  activités restent à compléter et peuvent la relever.
                </span>
              )}
              <div className="muted small">
                L&apos;établissement prend la catégorie la plus élevée de ses
                activités : il dépose une seule demande pour l&apos;ensemble
                (décret n° 2006-2687, art. 5).
              </div>
            </div>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="grid edii-acts">
          <thead>
            <tr>
              <th>Rubrique</th>
              <th>Cas et quantité</th>
              <th>Classement</th>
              <th aria-label="Retirer" />
            </tr>
          </thead>
          <tbody>
            {est.results.map((r, i) => (
              <ActivityRow
                key={i}
                r={r}
                update={(p) => update(i, p)}
                remove={() => remove(i)}
                open={open}
              />
            ))}
          </tbody>
        </table>
      </div>

      {est.additions.map((a) => (
        <AdditionPanel key={a.group} a={a} />
      ))}
    </div>
  );
}

function ActivityRow({
  r,
  update,
  remove,
  open,
}: {
  r: ActivityResult;
  update: (p: Partial<Activity>) => void;
  remove: () => void;
  open: (code: string) => void;
}) {
  const cases = variants(r.rub);
  const group = additionGroup(r.rub.code);
  const caseLabel = (v: string) =>
    v ||
    r.rub.items
      .filter((i) => i.path.length === 0)
      .map((i) => i.criterion || r.rub.title)
      .join(" / ");
  const o = r.outcome;
  return (
    <tr>
      <td>
        <button className="edii-link" onClick={() => open(r.rub.code)}>
          <span className="mono">{r.rub.code}</span> {r.rub.title}
        </button>
        {group ? (
          <span
            className="tag"
            title="Règle d'addition, arrêté du 23 février 2010, art. 2 bis"
          >
            groupe {group}
          </span>
        ) : null}
      </td>
      <td>
        {cases.length > 1 ? (
          <select
            className="edii-case"
            aria-label={`Cas pour ${r.rub.code}`}
            value={
              r.variant === undefined ? "" : String(cases.indexOf(r.variant))
            }
            onChange={(e) =>
              update({
                variant:
                  e.target.value === "" ? undefined : Number(e.target.value),
                picked: undefined,
              })
            }
          >
            <option value="">Choisir le cas…</option>
            {cases.map((v, i) => (
              <option key={i} value={i}>
                {caseLabel(v)}
              </option>
            ))}
          </select>
        ) : null}
        {r.units.length && !r.needsVariant ? (
          <div className="edii-qty">
            <input
              inputMode="decimal"
              value={r.activity.quantity ?? ""}
              placeholder="Quantité"
              aria-label={`Quantité pour ${r.rub.code}`}
              onChange={(e) =>
                update({ quantity: e.target.value, picked: undefined })
              }
            />
            <select
              value={r.unit}
              onChange={(e) =>
                update({ unit: e.target.value, picked: undefined })
              }
              aria-label="Unité"
            >
              {r.units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        ) : null}
      </td>
      <td>
        {r.classe !== null ? <ClasseBadge classe={r.classe} /> : null}
        {r.needsVariant ? (
          <span className="muted small">Choisir le cas</span>
        ) : null}
        {o?.status === "needs_quantity" ? (
          <span className="muted small">Saisir la quantité</span>
        ) : null}
        {o?.status === "unit_mismatch" ? (
          <span className="error small">{o.reason}</span>
        ) : null}
        {o?.status === "definition" ? (
          <span className="small">
            Définition, voir{" "}
            {o.related.map((c) => (
              <button key={c} className="edii-link" onClick={() => open(c)}>
                {c}
              </button>
            ))}
          </span>
        ) : null}
        {o?.status === "choose" ? (
          <select
            className="edii-case"
            value={
              r.activity.picked === undefined ? "" : String(r.activity.picked)
            }
            onChange={(e) =>
              update({
                picked:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            title={o.reason}
            aria-label={`Préciser le cas pour ${r.rub.code}`}
          >
            <option value="">Préciser le cas…</option>
            {o.items.map((it) => {
              const idx = r.rub.items.indexOf(it);
              return (
                <option key={idx} value={idx}>
                  {LABEL[it.category]} : {it.criterion}
                </option>
              );
            })}
            {o.belowAll ? (
              <option value={-1}>Aucun de ces cas : non classé</option>
            ) : null}
          </select>
        ) : null}
        {r.item ? (
          <div className="muted small edii-why">{r.item.criterion}</div>
        ) : null}
      </td>
      <td>
        <button
          className="ghost edii-remove"
          onClick={remove}
          aria-label={`Retirer ${r.rub.code}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

const STUDY_SHORT: Record<StudyKind, string> = {
  eie_a: "EIE catégorie A",
  eie_b: "EIE catégorie B",
  cahier_des_charges: "Cahier des charges",
  depollution: "Étude de dépollution",
  demande_avis: "Demande d'avis",
};

function StudyCard({
  activities,
  situation,
  sensitive,
  setSituation,
  setSensitive,
  update,
}: {
  activities: Activity[];
  situation: Situation;
  sensitive: boolean;
  setSituation: (s: Situation) => void;
  setSensitive: (z: boolean) => void;
  update: (i: number, patch: Partial<Activity>) => void;
}) {
  const result = establishmentStudy(
    activities.map((a) => a.eie),
    situation,
    sensitive,
  );
  return (
    <div className="card edii-study">
      <div className="edii-head">
        <h2>Étude environnementale (ANPE)</h2>
        <span className="muted small">
          Décret n° 2005-1991 du 11 juillet 2005
        </span>
      </div>
      <div className="form">
        <div className="field wide">
          <label htmlFor="establishment-situation">
            Situation de l&apos;établissement
          </label>
          <select
            id="establishment-situation"
            value={situation}
            onChange={(e) => setSituation(e.target.value as Situation)}
          >
            {Object.entries(SITUATIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="field wide edii-check">
          <span>
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
            />{" "}
            Le site peut affecter une zone protégée ou sensible (forêts,
            paysages naturels ou historiques, parcs, espaces protégés, faune et
            flore)
          </span>
        </label>
      </div>

      <div className="table-wrap edii-eie-wrap">
        <table className="grid edii-eie">
          <thead>
            <tr>
              <th>Activité</th>
              <th>Entrée du décret (annexe 1 ou 2)</th>
              <th>Étude</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a, i) => {
              const rub = rubrique(a.code)!;
              const cases = variants(rub);
              const variant =
                cases.length === 1
                  ? cases[0]
                  : a.variant !== undefined
                    ? cases[a.variant]
                    : undefined;
              const { suggested, note, others } = entriesFor(a.code, variant);
              const kind = result.perActivity[i];
              const entry = eieEntry(a.eie);
              return (
                <tr key={i}>
                  <td>
                    <span className="mono">{rub.code}</span> {rub.title}
                  </td>
                  <td>
                    <select
                      className="edii-case"
                      value={a.eie && (a.eie === "none" || entry) ? a.eie : ""}
                      onChange={(e) =>
                        update(i, { eie: e.target.value || undefined })
                      }
                      aria-label={`Entrée du décret pour ${rub.code}`}
                    >
                      <option value="">Choisir…</option>
                      {suggested.length ? (
                        <optgroup label="Suggérées pour cette rubrique">
                          {suggested.map(({ entry: e, when }) => (
                            <option key={e.id} value={e.id}>
                              {entryLabel(e.id, when)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="Aucune entrée">
                        <option value="none">
                          Aucune entrée propre (activité annexe, ou dans aucune
                          annexe)
                        </option>
                      </optgroup>
                      {(["A", "B", "CDC"] as const).map((k) => (
                        <optgroup key={k} label={eie.annexes[k]}>
                          {others
                            .filter((e) => e.annexe === k)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {entryLabel(e.id, e.text)}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    {entry ? (
                      <div className="muted small edii-why">{entry.text}</div>
                    ) : a.eie === "none" ? null : (
                      <ul className="edii-suggest">
                        {suggested.map(({ entry: e, when }) => (
                          <li key={e.id}>
                            <button
                              className="edii-link"
                              onClick={() => update(i, { eie: e.id })}
                            >
                              {entryRef(e.id)}
                            </button>{" "}
                            <span className="small">{when}</span>
                          </li>
                        ))}
                        <li>
                          <button
                            className="edii-link"
                            onClick={() => update(i, { eie: "none" })}
                          >
                            Aucune entrée propre
                          </button>{" "}
                          <span className="small muted">
                            {note ??
                              "si aucune suggestion ne s'applique : l'activité est annexe à l'activité principale de l'unité, ou ne figure dans aucune annexe."}
                          </span>
                        </li>
                      </ul>
                    )}
                  </td>
                  <td>
                    {kind ? (
                      <span className={`badge edii-s-${kind}`}>
                        {STUDY_SHORT[kind]}
                      </span>
                    ) : (
                      <span className="muted small">à choisir</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="edii-steps-details">
        <summary>Comment les entrées sont suggérées</summary>
        <p className="muted small">
          Le décret classe les unités selon leur activité principale ; la
          nomenclature, les activités et substances qu&apos;elles contiennent.
          Les suggestions rapprochent les deux textes avec la condition dont
          elles dépendent : c&apos;est une lecture, à confirmer pour chaque
          activité.
        </p>
      </details>

      {result.study ? (
        <div className="edii-study-result">
          <div className="edii-verdict">
            <span className={`badge edii-big edii-s-${result.study.kind}`}>
              {result.study.title}
            </span>
            {result.study.delay ? (
              <span>Délai de l&apos;ANPE : {result.study.delay}</span>
            ) : null}
          </div>
          {activities.length > 1 && new Set(result.perActivity).size > 1 ? (
            <p className="small muted">
              L&apos;établissement retient l&apos;étude la plus exigeante de ses
              activités.
            </p>
          ) : null}
          <details className="edii-steps-details">
            <summary>
              Les démarches ({result.study.steps.length} étape
              {result.study.steps.length > 1 ? "s" : ""})
            </summary>
            <ol className="edii-steps small">
              {result.study.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="muted small">Base : {result.study.basis}.</p>
          </details>
          {result.study.kind === "depollution" ? (
            <p className="edii-note small">
              La circulaire n° 27 du 7 novembre 2024 ouvrait cette
              régularisation jusqu&apos;au 31 décembre 2025 : vérifier auprès de
              l&apos;ANPE qu&apos;elle est toujours en vigueur.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="muted">
          {result.missing === 1
            ? "Choisir l'entrée du décret de l'activité restante"
            : `Choisir l'entrée du décret des ${result.missing} activités restantes`}{" "}
          pour connaître l&apos;étude à fournir.
        </p>
      )}
    </div>
  );
}

const entryRef = (id: string) =>
  id.startsWith("CDC")
    ? `Annexe 2, n° ${id.slice(3)}`
    : `Annexe 1 cat. ${id[0]}, n° ${id.slice(1)}`;

function entryLabel(id: string, text: string) {
  const short = text.length > 110 ? `${text.slice(0, 110)}…` : text;
  return `${entryRef(id)} · ${short}`;
}

function AdditionPanel({ a }: { a: AdditionResult }) {
  return (
    <div className={`edii-addition ${a.upgraded ? "up" : ""}`}>
      <h3>Règle d&apos;addition, groupe {a.group}</h3>
      <p className="small muted">
        Arrêté du 23 février 2010, art. 2 bis : l&apos;établissement détient
        plusieurs substances du groupe {a.group}. Prises une à une, elles le
        classent au plus en {ordinal(a.base)}
        {a.target
          ? ` ; chaque quantité qx est comparée au seuil Qx de la ${ordinal(a.target)} catégorie.`
          : "."}
      </p>
      {a.target ? (
        <table className="grid edii-sum">
          <thead>
            <tr>
              <th>Rubrique</th>
              <th>qx</th>
              <th>Qx ({ordinal(a.target)})</th>
              <th>qx / Qx</th>
            </tr>
          </thead>
          <tbody>
            {a.members.map((m, i) => (
              <tr key={i}>
                <td>
                  <span className="mono">{m.result.rub.code}</span>{" "}
                  {m.result.rub.title}
                </td>
                <td>
                  {m.result.q ? fmtQty(m.result.q.value, m.result.q.unit) : "—"}
                </td>
                <td>
                  {m.Q !== null && m.result.q ? (
                    fmtQty(m.Q, m.result.q.unit)
                  ) : (
                    <span className="muted small">{m.note}</span>
                  )}
                </td>
                <td>{m.ratio !== null ? fmtRatio(m.ratio) : "—"}</td>
              </tr>
            ))}
            <tr className="edii-total">
              <td colSpan={3}>Σ qx / Qx</td>
              <td>{fmtRatio(a.sum)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <p className="edii-sum-verdict">
        {a.upgraded ? <ClasseBadge classe={a.target!} /> : null} {a.reason}
      </p>
    </div>
  );
}

const listFr = (xs: string[]) =>
  xs.length < 2
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`;

function fmtQty(v: number, unit: string) {
  if (unit === "kg" && v >= 1000)
    return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} t`;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unit}`;
}

function RubriqueView({
  rub,
  count,
  onAdd,
  onOpen,
}: {
  rub: Rubrique;
  count: number;
  onAdd: () => void;
  onOpen: (code: string) => void;
}) {
  const group = additionGroup(rub.code);
  const related =
    rub.kind === "definition"
      ? nomenclature.rubriques
          .filter(
            (r) =>
              r.code !== rub.code &&
              r.code.startsWith(`${rub.code.split(" ")[0]} bis`),
          )
          .map((r) => r.code)
      : [];
  return (
    <div className="card">
      <div className="edii-head">
        <h2>
          <span className="mono">{rub.code}</span> {rub.title}
        </h2>
        <span className="muted small">
          {rub.replaces
            ? `Modifiée par l'arrêté de ${rub.source}`
            : rub.source === "2005"
              ? "Arrêté de 2005"
              : `Ajoutée par l'arrêté de ${rub.source}`}
        </span>
      </div>
      <p className="edii-text">{rub.text}</p>
      {group ? (
        <p className="edii-note small">
          Règle d&apos;addition (art. 2 bis, arrêté du 23 février 2010) : groupe{" "}
          {group}. Si l&apos;établissement détient plusieurs substances du
          groupe, Σ qx/Qx &gt; 1 le classe dans la catégorie supérieure.
        </p>
      ) : null}
      {rub.items.length ? (
        <div className="table-wrap">
          <table className="grid edii-items">
            <thead>
              <tr>
                <th>Cas</th>
                <th>Seuil</th>
                <th>Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {rub.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    {it.path.length ? (
                      <div className="muted small">{it.path.join(" › ")}</div>
                    ) : null}
                    {it.criterion || rub.title}
                  </td>
                  <td>
                    {describe(it.condition)}
                    {it.condition?.unit_inferred ? (
                      <span
                        className="tag"
                        title="Unité déduite des autres lignes"
                      >
                        déduite
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <ClasseBadge classe={it.category} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="edii-actions">
        {rub.kind === "activity" ? (
          <button onClick={onAdd}>
            {count
              ? "Ajouter encore à l'établissement"
              : "Ajouter à l'établissement"}
          </button>
        ) : (
          <span className="muted small">
            Cette rubrique définit une famille de substances ; ajouter plutôt{" "}
            {related.map((c) => (
              <button key={c} className="edii-link" onClick={() => onOpen(c)}>
                {c}
              </button>
            ))}
          </span>
        )}
        {rub.items[0] ? (
          <span className="muted small">Source : {sourceOf(rub.items[0])}</span>
        ) : null}
      </div>
    </div>
  );
}

function sourceOf(it: Item): string {
  const id = it.ref.split(" ")[0];
  const s = SOURCE[id];
  const page = it.ref.match(/p\.(\d+)/)?.[1];
  return s
    ? `${s.title.split(",")[0]} (${s.jort})${page ? `, page ${page} du PDF` : ""}`
    : it.ref;
}
