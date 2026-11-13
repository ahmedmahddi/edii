"use client";
/**
 * One register, as a checklist: a summary that stays in view, chips to narrow the list (to do,
 * non conforming, essentials…), one row per text, and a sheet (a panel on desktop) to evaluate a
 * text: its requirements, a new evaluation with evidence, the action plan, the history.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { downloadWorkbook, today } from "@/app/components/download";
import { Icon } from "@/app/components/icons";
import { classLabel, dateFr, Profil, refOf, useFiches } from "@/app/components/registre-shared";
import { canWrite, preuveUrl, uploadPreuve } from "@/lib/cloud/api";
import { importance } from "@/lib/registre/importance";
import { metierLabels } from "@/lib/registre/profil";
import { remplacePar, type Texte } from "@/lib/registre/referentiel";
import {
  abrogePar,
  addTexte,
  alertes,
  CONFORMITES,
  type Conformite,
  dues,
  ETATS,
  evaluer,
  FREQUENCES,
  historique,
  type Ligne,
  nouveautes,
  plusApplicables,
  type Preuve,
  preuveFichier,
  preuveLien,
  preuvesDe,
  preuveTexte,
  prochaine,
  type Registre,
  texteFromAmendment,
} from "@/lib/registre/registre";
import { study } from "@/lib/studies";
import { defaults, type FicheData, TYPES } from "@/lib/veille/fiche";
import { fillHistorique, fillRegister, historiqueRows, ligneRow } from "@/lib/veille/registre";
import { type Amendment, fold, rules } from "@/lib/veille/watch";

const ESSENTIELS = 30;
type Chip = "tous" | "afaire" | "nc" | "conformes" | "essentiels" | "suggestions";
const CHIPS: [Chip, string][] = [
  ["tous", "Tous"],
  ["afaire", "À faire"],
  ["nc", "Non conformes"],
  ["conformes", "Conformes"],
  ["essentiels", "Essentiels"],
  ["suggestions", "Suggestions"],
];
const ETAT_SHORT: Record<string, string> = { "a-evaluer": "À évaluer", "en-retard": "En retard", bientot: "Sous 30 j", "a-jour": "À jour" };
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const setOn = (r: Registre, id: string, patch: Partial<Ligne>): Registre => ({
  ...r,
  lignes: r.lignes.map((l) => (l.texte.id === id ? { ...l, ...patch } : l)),
});

export function RegistreView({
  reg,
  change,
  texts,
  amendments,
  onBack,
  saved,
}: {
  reg: Registre;
  change: (fn: (r: Registre) => Registre) => void;
  texts: Texte[];
  amendments: Amendment[];
  onBack: () => void;
  saved: boolean;
}) {
  const cloud = useCloud();
  const fiches = useFiches();
  const ficheOf = (l: Ligne) => defaults(l.texte.domaine, fiches[l.texte.id]);
  const [chip, setChip] = useState<Chip>("tous");
  const [domaine, setDomaine] = useState("all");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [exporting, setExporting] = useState(false);
  const editable = !cloud.current || canWrite(cloud.current);
  const who = cloud.name || cloud.user?.email || "";

  const retenus = reg.lignes.filter((l) => l.retenu);
  const alerts = alertes(reg, amendments);
  const pending = new Set(alerts.map((a) => `${a.ligne.texte.id}|${a.amendment.id}`));
  const historyOf = (l: Ligne) =>
    historique(l, amendments)
      .filter((a) => !pending.has(`${l.texte.id}|${a.id}`))
      .reverse();
  const gone = plusApplicables(reg);
  const rank = useMemo(() => {
    const byId = new Map(texts.map((t) => [t.id, t]));
    return new Map(reg.lignes.map((l) => [l.texte.id, importance(byId.get(l.texte.id) ?? l.texte, reg.site)]));
  }, [texts, reg.lignes, reg.site]);
  const score = (l: Ligne) => rank.get(l.texte.id)?.score ?? 0;
  const byScore = (a: Ligne, b: Ligne) => score(b) - score(a);
  const news = useMemo(
    () => nouveautes(reg, texts).sort((a, b) => importance(b.texte, reg.site).score - importance(a.texte, reg.site).score),
    [reg, texts],
  );
  const due = dues(reg);
  const count = (c: Conformite) => retenus.filter((l) => l.conformite === c).length;
  const evaluated = retenus.filter((l) => l.conformite).length;
  const progress = retenus.length ? Math.round((evaluated / retenus.length) * 100) : 0;
  const domains = Object.keys(rules.domains).filter((d) => reg.lignes.some((l) => l.texte.domaine === d));
  const essentielIds = useMemo(() => new Set([...retenus].sort(byScore).slice(0, ESSENTIELS).map((l) => l.texte.id)), [reg.lignes, rank]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLigne = (id: string, patch: Partial<Ligne>) => change((r) => setOn(r, id, patch));
  const chipCount: Record<Chip, number> = {
    tous: retenus.length,
    afaire: due.length,
    nc: count("NC"),
    conformes: count("C"),
    essentiels: Math.min(ESSENTIELS, retenus.length),
    suggestions: reg.lignes.length - retenus.length,
  };

  const shown = reg.lignes.filter((l) => {
    const q = fold(query);
    if (chip === "suggestions" ? l.retenu : !l.retenu) return false;
    if (chip === "nc" && l.conformite !== "NC") return false;
    if (chip === "conformes" && l.conformite !== "C") return false;
    if (chip === "afaire" && prochaine(l).etat === "a-jour") return false;
    if (chip === "essentiels" && !essentielIds.has(l.texte.id)) return false;
    if (domaine !== "all" && l.texte.domaine !== domaine) return false;
    return !q || fold(`${l.texte.titre} ${l.texte.theme} ${l.resume}`).includes(q);
  });
  const flat = chip !== "tous" || !!query || domaine !== "all";
  const groups = Object.keys(rules.domains)
    .map((d) => [d, shown.filter((l) => l.texte.domaine === d).sort(byScore)] as const)
    .concat([["autres", shown.filter((l) => !(l.texte.domaine in rules.domains)).sort(byScore)] as const])
    .filter(([, lignes]) => lignes.length);

  const candidates = useMemo(() => {
    const q = fold(adding);
    if (q.length < 3) return [];
    const inRegister = new Set(reg.lignes.filter((l) => l.retenu).map((l) => l.texte.id));
    return texts.filter((t) => !inRegister.has(t.id) && fold(`${t.titre} ${t.theme} ${t.numero ?? ""}`).includes(q)).slice(0, 12);
  }, [adding, texts, reg.lignes]);

  const open = openId ? reg.lignes.find((l) => l.texte.id === openId) : undefined;
  const row = (l: Ligne) => <LigneRow key={l.texte.id} l={l} onOpen={() => setOpenId(l.texte.id)} />;

  const exportAll = async () => {
    setExporting(true);
    try {
      await downloadWorkbook((wb) => {
        fillRegister(
          wb,
          [...retenus]
            .sort(byScore)
            .map((l) => ligneRow(l, ficheOf(l), { abroge: abrogePar(l, amendments), remplacePar: remplacePar(l.texte), modifie: historique(l, amendments) })),
          new Date(),
          reg.nom,
        );
        fillHistorique(wb, retenus.flatMap(historiqueRows));
      }, `ID-QSE-002_${reg.nom.replace(/[^\p{L}\p{N}]+/gu, "_")}_${today()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="registre">
      <button type="button" className="edii-link registre-back" onClick={onBack}>
        <Icon name="back" size={16} /> Tous les registres
      </button>
      <header className="card registre-head">
        <label className="registre-name">
          <span className="visually-hidden">Nom de l’établissement</span>
          <input value={reg.nom} onChange={(e) => change((r) => ({ ...r, nom: e.target.value }))} disabled={!editable} />
        </label>
        <p className="muted small">
          {classLabel(reg.classe, reg.activites.length)}
          {reg.etude ? ` · ${study(reg.etude, false).title}` : ""}
          {reg.activites.length ? ` · rubriques ${reg.activites.map((a) => a.code).join(", ")}` : ""}
          {metierLabels(reg.site).length ? ` · ${metierLabels(reg.site).join(", ")}` : ""}
          {reg.restauration ? (
            <>
              {" · "}
              <a href={reg.restauration}>revoir le classement</a>
            </>
          ) : null}
        </p>
        {!saved ? <p className="registre-warning">Non enregistré dans ce navigateur : sauvegardez dans un fichier.</p> : null}
        <div className="registre-progress">
          <span className="home-progress" role="img" aria-label={`${progress} % des textes évalués`}>
            <span style={{ width: `${progress}%` }} />
          </span>
          <span className="registre-progress-text">
            <strong>{progress} %</strong> évalué · {retenus.length} textes
          </span>
        </div>
        <div className="registre-kpis">
          <span className="pill pill-ok">{count("C")} conformes</span>
          <span className={`pill ${count("NC") ? "pill-bad" : "pill-muted"}`}>{count("NC")} non conformes</span>
          <span className={`pill ${due.length ? "pill-warn" : "pill-muted"}`}>{due.length} à faire</span>
          <span className="pill pill-muted">{count("NA")} non applicables</span>
        </div>
      </header>

      {alerts.length ? (
        <ToDo className="registre-alerts" title={`Textes du registre modifiés au JORT (${alerts.length})`}>
          {alerts.map(({ ligne, amendment }) => (
            <li key={`${ligne.texte.id}-${amendment.id}`}>
              <p>
                <strong>{refOf(ligne.texte)}</strong> est visé par :{" "}
                <a href={amendment.pdf} target="_blank" rel="noreferrer" dir="auto">
                  {amendment.title}
                </a>{" "}
                <span className="muted small">
                  (JORT n° {amendment.issue}/{amendment.year}, p. {amendment.page})
                </span>
              </p>
              {editable ? (
                <div className="registre-news-actions">
                  <button
                    type="button"
                    onClick={() =>
                      change((r) => {
                        const seen = setOn(r, ligne.texte.id, { vus: [...ligne.vus, amendment.id], evalue: "", conformite: "" });
                        return addTexte(seen, texteFromAmendment(amendment, ligne.texte, texts));
                      })
                    }
                  >
                    Ajouter ce texte et réévaluer
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setLigne(ligne.texte.id, { vus: [...ligne.vus, amendment.id], evalue: "", conformite: "" })}
                  >
                    Réévaluer seulement
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ToDo>
      ) : null}

      {news.length ? (
        <ToDo
          className="registre-news"
          title={`Nouveaux textes pour ce site (${news.length})`}
          note="Parus au JORT depuis la création du registre, ou devenus applicables avec le profil ou le classement du site."
          action={
            editable ? (
              <button type="button" className="secondary-button" onClick={() => change((r) => news.reduce((acc, n) => addTexte(acc, n.texte), r))}>
                Tout ajouter
              </button>
            ) : undefined
          }
        >
          {news.map(({ texte, reasons }) => (
            <li key={texte.id}>
              <div>
                {texte.source ? (
                  <a href={texte.source} target="_blank" rel="noreferrer" dir="auto">
                    {texte.titre}
                  </a>
                ) : (
                  texte.titre
                )}
                <p className="muted small">
                  {texte.theme} · {reasons.join(", ")}
                </p>
              </div>
              {editable ? (
                <div className="registre-news-actions">
                  <button type="button" onClick={() => change((r) => addTexte(r, texte))}>
                    Ajouter
                  </button>
                  <button type="button" className="secondary-button" onClick={() => change((r) => ({ ...r, ecartes: [...r.ecartes, texte.id] }))}>
                    Écarter
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ToDo>
      ) : null}

      {gone.length ? (
        <ToDo
          className="registre-gone"
          title={`Textes qui ne s’appliquent plus au site (${gone.length})`}
          note="Le profil ou le classement a changé : ces textes ne répondent plus à leurs conditions. Retirez-les, ou gardez-les si le site y reste soumis."
        >
          {gone.map((l) => (
            <li key={l.texte.id}>
              <div>
                <span dir="auto">{l.texte.titre}</span>
                <p className="muted small">
                  {l.texte.theme} · proposé pour : {l.raisons.join(", ")}
                </p>
              </div>
              {editable ? (
                <div className="registre-news-actions">
                  <button type="button" onClick={() => setLigne(l.texte.id, { retenu: false })}>
                    Retirer
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setLigne(l.texte.id, { garde: true })}>
                    Garder
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ToDo>
      ) : null}

      <div className="chips" role="tablist" aria-label="Afficher">
        {CHIPS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={chip === id} className={chip === id ? "chip active" : "chip"} onClick={() => setChip(id)}>
            {label}
            <span className="chip-count">{chipCount[id]}</span>
          </button>
        ))}
      </div>
      <div className="registre-tools">
        <label className="registre-search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un texte, une exigence…" aria-label="Rechercher dans le registre" />
        </label>
        <button type="button" className={`secondary-button registre-tools-toggle${tools ? " active" : ""}`} aria-expanded={tools} onClick={() => setTools(!tools)}>
          <Icon name="more" size={18} /> Plus
        </button>
      </div>
      {tools ? (
        <div className="registre-tools-more">
          <label>
            <span>Domaine</span>
            <select value={domaine} onChange={(e) => setDomaine(e.target.value)}>
              <option value="all">Tous les domaines</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {rules.domains[d]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" disabled={!retenus.length || exporting} onClick={exportAll}>
            {exporting ? "Préparation du fichier…" : "Exporter le registre (Excel)"}
          </button>
          <details className="registre-profil-card">
            <summary>Profil du site</summary>
            <Profil site={reg.site} onChange={(site) => change((r) => ({ ...r, site }))} />
          </details>
          <label className="registre-add-field">
            <span>Ajouter un texte du référentiel ou du JORT</span>
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Au moins 3 lettres : bruit, 2000-147, chaudière…" />
          </label>
          {candidates.length ? (
            <ul className="registre-candidates">
              {candidates.map((t) => (
                <li key={t.id}>
                  <div>
                    <span dir="auto">{t.titre}</span>
                    <p className="muted small">
                      {t.theme}
                      {t.publie ? ` · ${t.publie}` : ""}
                    </p>
                  </div>
                  {editable ? (
                    <button type="button" className="secondary-button" onClick={() => change((r) => addTexte(r, t))}>
                      Ajouter
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : adding.length >= 3 ? (
            <p className="muted small">Aucun texte trouvé hors du registre.</p>
          ) : null}
        </div>
      ) : null}

      <p className="muted small registre-count" aria-live="polite">
        {shown.length} texte{shown.length > 1 ? "s" : ""}
        {chip === "essentiels" ? " : ceux qui comptent le plus pour ce site (nature du texte, textes qui s’y réfèrent, activité, date)" : ""}
      </p>
      {!shown.length ? (
        <p className="card registre-empty">
          {chip === "afaire" ? "Rien à faire : toutes les évaluations sont à jour." : chip === "nc" ? "Aucune non-conformité." : "Aucun texte ici."}
        </p>
      ) : flat ? (
        <ol className="registre-rows">{[...shown].sort(byScore).map(row)}</ol>
      ) : (
        groups.map(([d, lignes]) => {
          const nc = lignes.filter((l) => l.conformite === "NC").length;
          const todo = lignes.filter((l) => prochaine(l).etat !== "a-jour").length;
          return (
            <details key={d} className="registre-group" open={groups.length === 1}>
              <summary>
                <span>{rules.domains[d] ?? d}</span>
                <span className="registre-group-counts">
                  {lignes.length}
                  {nc ? <b className="is-nc"> · {nc} NC</b> : null}
                  {todo ? <b className="is-due"> · {todo} à faire</b> : null}
                </span>
              </summary>
              <ol className="registre-rows">{lignes.map(row)}</ol>
            </details>
          );
        })
      )}

      {open ? (
        <LigneSheet
          key={open.texte.id}
          l={open}
          fiche={fiches[open.texte.id]}
          raisons={rank.get(open.texte.id)?.raisons}
          history={historyOf(open)}
          repealed={abrogePar(open, amendments)}
          set={(patch) => setLigne(open.texte.id, patch)}
          replace={(fn) => change((r) => ({ ...r, lignes: r.lignes.map((x) => (x.texte.id === open.texte.id ? fn(x) : x)) }))}
          onClose={() => setOpenId(null)}
          who={who}
          editable={editable}
          upload={cloud.current ? (file) => uploadPreuve(cloud.current!.id, reg.id, file) : null}
        />
      ) : null}
    </div>
  );
}

/** One text of the register: what it is, where its evaluation stands. Tap to open it. */
function LigneRow({ l, onOpen }: { l: Ligne; onOpen: () => void }) {
  const next = prochaine(l);
  const n = preuvesDe(l).length;
  return (
    <li>
      <button type="button" className={`ligne-row conf-${l.conformite || "none"}${l.retenu ? "" : " is-left"}`} onClick={onOpen}>
        <span className="ligne-row-main">
          <span className="ligne-row-title" dir="auto">
            {l.texte.titre}
          </span>
          <span className="ligne-row-meta">
            {l.texte.theme}
            {!l.retenu
              ? " · non retenu"
              : l.conformite === "NC"
                ? l.actionFaite
                  ? ` · action réalisée`
                  : l.echeance
                    ? ` · échéance ${dateFr(l.echeance)}`
                    : " · action à planifier"
                : ` · ${ETAT_SHORT[next.etat]}${next.date ? ` · ${dateFr(next.date)}` : ""}`}
            {l.responsable ? <span className="ligne-row-who">{initials(l.responsable)}</span> : null}
            {n ? <span className="ligne-row-clip">📎 {n}</span> : null}
          </span>
        </span>
        <span className="ligne-row-side">
          <span className={`pill ${l.conformite === "C" ? "pill-ok" : l.conformite === "NC" ? "pill-bad" : l.conformite === "NA" ? "pill-muted" : "pill-warn"}`}>
            {l.conformite ? CONFORMITES[l.conformite] : "À évaluer"}
          </span>
          <Icon name="chevron" size={16} />
        </span>
      </button>
    </li>
  );
}

/** The sheet of one text: evaluate it, keep its evidence, write its action plan, read its history. */
function LigneSheet({
  l,
  fiche,
  raisons,
  history,
  repealed,
  set,
  replace,
  onClose,
  who,
  editable,
  upload,
}: {
  l: Ligne;
  fiche?: FicheData;
  raisons?: string[];
  history: Amendment[];
  repealed?: Amendment;
  set: (patch: Partial<Ligne>) => void;
  replace: (fn: (l: Ligne) => Ligne) => void;
  onClose: () => void;
  who: string;
  editable: boolean;
  upload: ((file: File) => Promise<string>) | null;
}) {
  const proposed = defaults(l.texte.domaine, fiche);
  const next = prochaine(l);
  const [conf, setConf] = useState<Conformite>("");
  const [date, setDate] = useState(today());
  const [comment, setComment] = useState("");
  const [preuves, setPreuves] = useState<Preuve[]>([]);
  const [adding, setAdding] = useState<"lien" | "texte" | null>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  // A non-conformity's risk and action plan, recorded with it (prefilled from the text or its fiche).
  const [risque, setRisque] = useState(l.risque || proposed.risque);
  const [plan, setPlan] = useState(l.plan || proposed.plan);
  const [responsable, setResponsable] = useState(l.responsable);
  const [echeance, setEcheance] = useState(l.echeance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const evidence = preuvesDe(l);
  // The uploaded files are read through links that last an hour, fetched when the sheet opens.
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = [...evidence, ...preuves].map((p) => p.path).filter((p): p is string => !!p && !(p in urls));
    if (!paths.length) return;
    Promise.all(paths.map((p) => preuveUrl(p).then((u) => [p, u] as const).catch(() => [p, ""] as const))).then((pairs) =>
      setUrls((u) => ({ ...u, ...Object.fromEntries(pairs) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.historique, l.preuves, preuves]);
  useEffect(() => {
    document.body.classList.add("has-panel");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    panel.current?.focus();
    return () => {
      document.body.classList.remove("has-panel");
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const linkOf = (p: Preuve) => p.url ?? (p.path ? urls[p.path] : undefined);
  const addFile = async (file: File | undefined) => {
    if (!file || !upload) return;
    setBusy(true);
    setError("");
    try {
      const path = await upload(file);
      setPreuves((ps) => [...ps, preuveFichier(file.name, path, file.type, who)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const addLink = () => {
    if (!/^https?:\/\//i.test(linkUrl.trim())) {
      setError("Le lien doit commencer par http:// ou https://");
      return;
    }
    setPreuves((ps) => [...ps, preuveLien(linkName, linkUrl, who)]);
    setLinkName("");
    setLinkUrl("");
    setAdding(null);
    setError("");
  };
  const addNote = () => {
    if (!noteText.trim()) {
      setError("Écrivez le texte de la preuve.");
      return;
    }
    setPreuves((ps) => [...ps, preuveTexte(noteName, noteText, who)]);
    setNoteName("");
    setNoteText("");
    setAdding(null);
    setError("");
  };
  const record = () => {
    if (!conf) return;
    const action = conf === "NC" ? { risque, plan, responsable, echeance } : undefined;
    replace((x) => evaluer(x, { conformite: conf, date, commentaire: comment, par: who, preuves, action }));
    setConf("");
    setComment("");
    setPreuves([]);
    setSaved(`Évaluation du ${dateFr(date)} enregistrée.`);
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={l.texte.titre} ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="sheet-handle" aria-hidden="true" />
          <button type="button" className="panel-close" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
          <span className="badge veille-domain">{l.texte.theme}</span>
          <h2 dir="auto">{l.texte.titre}</h2>
          <p className="muted small">
            {refOf(l.texte)}
            {l.texte.publie ? ` · ${l.texte.publie}` : ""}
            {l.texte.source ? (
              <>
                {" · "}
                <a href={l.texte.source} target="_blank" rel="noreferrer">
                  lire le texte
                </a>
              </>
            ) : null}
          </p>
          <div className="panel-status">
            <span className={`pill ${l.conformite === "C" ? "pill-ok" : l.conformite === "NC" ? "pill-bad" : l.conformite === "NA" ? "pill-muted" : "pill-warn"}`}>
              {l.conformite ? CONFORMITES[l.conformite] : "À évaluer"}
            </span>
            <span className={`pill ${next.etat === "en-retard" ? "pill-bad" : next.etat === "a-jour" ? "pill-ok" : "pill-warn"}`}>
              {ETATS[next.etat]}
              {next.date ? ` · ${dateFr(next.date)}` : ""}
            </span>
            {l.conformite === "C" && l.actionFaite ? <span className="pill pill-ok">Action réalisée le {dateFr(l.actionFaite)}</span> : null}
          </div>
        </div>
        <div className="panel-body">
          {repealed ? (
            <p className="registre-abroge small">
              Abrogé par{" "}
              <a href={repealed.pdf} target="_blank" rel="noreferrer" dir="auto">
                {repealed.title}
              </a>{" "}
              <span className="muted">
                (JORT n° {repealed.issue}/{repealed.year}, p. {repealed.page})
              </span>
            </p>
          ) : remplacePar(l.texte) ? (
            <p className="registre-abroge small">Remplacé par {remplacePar(l.texte)}</p>
          ) : null}

          {editable && l.retenu ? (
            <section className="panel-section panel-eval" aria-labelledby="eval-title">
              <h3 id="eval-title">Nouvelle évaluation</h3>
              <div className="segmented" role="radiogroup" aria-label="Conformité">
                {(["C", "NC", "NA"] as Conformite[]).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={conf === c} className={`seg seg-${c}${conf === c ? " active" : ""}`} onClick={() => setConf(c)}>
                    {CONFORMITES[c]}
                  </button>
                ))}
              </div>
              <div className="panel-grid">
                <label>
                  <span>Date</span>
                  <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  <span>Fréquence</span>
                  <select value={l.frequence} onChange={(e) => set({ frequence: e.target.value })}>
                    {Object.keys(FREQUENCES).map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>{conf === "NA" ? "Justification" : conf === "C" ? "Commentaire (facultatif)" : "Constat"}</span>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    conf === "NA"
                      ? "Pourquoi ce texte ne s’applique pas au site…"
                      : conf === "C"
                        ? "Ce qui a été vérifié…"
                        : "Ce qui a été vérifié, ce qui manque…"
                  }
                />
              </label>
              <div className="panel-evidence">
                <span className="panel-label">Preuves</span>
                {preuves.length ? (
                  <ul className="evidence-list">
                    {preuves.map((p) => (
                      <li key={p.id}>
                        <Icon name={p.path ? "file" : p.texte ? "note" : "link"} size={16} />
                        <span>
                          {p.nom}
                          {p.texte ? <small className="muted"> · {p.texte}</small> : null}
                        </span>
                        <button type="button" className="edii-link" onClick={() => setPreuves((ps) => ps.filter((x) => x.id !== p.id))}>
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="evidence-actions">
                  {upload ? (
                    <>
                      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => void addFile(e.target.files?.[0])} />
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}>
                        {busy ? "Envoi…" : "Photo ou PDF"}
                      </button>
                    </>
                  ) : null}
                  <button type="button" className={`secondary-button${adding === "texte" ? " active" : ""}`} onClick={() => setAdding(adding === "texte" ? null : "texte")}>
                    <Icon name="note" size={16} /> Texte
                  </button>
                  <button type="button" className={`secondary-button${adding === "lien" ? " active" : ""}`} onClick={() => setAdding(adding === "lien" ? null : "lien")}>
                    <Icon name="link" size={16} /> Lien
                  </button>
                  {!upload ? <span className="muted small">Les photos et fichiers demandent un espace de travail (compte).</span> : null}
                </div>
                {adding === "texte" ? (
                  <div className="evidence-form">
                    <label>
                      <span>Intitulé (facultatif)</span>
                      <input value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Contrat de maintenance, attestation…" />
                    </label>
                    <label>
                      <span>Preuve</span>
                      <textarea
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Ex. : contrat n° 2026-14 avec Société X, valable jusqu’au 31/12/2026 ; registre signé le 03/11/2026…"
                      />
                    </label>
                    <button type="button" className="secondary-button" onClick={addNote}>
                      Ajouter le texte
                    </button>
                  </div>
                ) : null}
                {adding === "lien" ? (
                  <div className="panel-grid">
                    <label>
                      <span>Intitulé</span>
                      <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Rapport de contrôle…" />
                    </label>
                    <label>
                      <span>Adresse</span>
                      <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" inputMode="url" />
                    </label>
                    <button type="button" className="secondary-button" onClick={addLink}>
                      Ajouter le lien
                    </button>
                  </div>
                ) : null}
              </div>
              {conf === "NC" ? (
                <div className="panel-nc">
                  <span className="panel-label">Risque et plan d’action</span>
                  <label>
                    <span>Risque</span>
                    <textarea rows={2} value={risque} onChange={(e) => setRisque(e.target.value)} />
                  </label>
                  <label>
                    <span>Action à mener</span>
                    <textarea rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} />
                  </label>
                  <div className="panel-grid">
                    <label>
                      <span>Responsable</span>
                      <input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
                    </label>
                    <label>
                      <span>Échéance</span>
                      <input type="date" value={echeance} min={date} onChange={(e) => setEcheance(e.target.value)} />
                    </label>
                  </div>
                </div>
              ) : null}
              {error ? (
                <p className="registre-warning" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="button" className="panel-record" disabled={!conf || busy} onClick={record}>
                Enregistrer l’évaluation
              </button>
              {saved ? (
                <p className="auth-done" role="status">
                  {saved}
                </p>
              ) : null}
            </section>
          ) : null}

          {l.retenu && l.conformite === "NC" ? (
            <section className="panel-section" aria-labelledby="plan-title">
              <h3 id="plan-title">Plan d’action</h3>
              <label>
                <span>Action</span>
                <textarea rows={3} value={l.plan || proposed.plan} onChange={(e) => set({ plan: e.target.value })} disabled={!editable} />
              </label>
              <div className="panel-grid">
                <label>
                  <span>Responsable</span>
                  <input value={l.responsable} onChange={(e) => set({ responsable: e.target.value })} disabled={!editable} />
                </label>
                <label>
                  <span>Échéance</span>
                  <input type="date" value={l.echeance} onChange={(e) => set({ echeance: e.target.value })} disabled={!editable} />
                </label>
              </div>
              <label>
                <span>Risque</span>
                <textarea rows={2} value={l.risque || proposed.risque} onChange={(e) => set({ risque: e.target.value })} disabled={!editable} />
              </label>
              <p className="muted small">L’action est close par une nouvelle évaluation conforme.</p>
            </section>
          ) : null}

          <details className="panel-section panel-details" open={!l.retenu || l.conformite === "" || undefined}>
            <summary>{l.conformite === "C" || l.conformite === "NA" || l.conformite === "NC" ? "Exigences" : "Exigences et risque"}</summary>
            {!l.resume ? (
              <p className="muted small">
                {fiche?.r ? "Résumé rédigé" : fiche?.o?.length ? "Exigences relevées dans les articles du texte" : "Proposé d’après le domaine du texte"}
                {" "}: à vérifier et à adapter au site.
                {fiche?.p ? ` Périodicité relevée : ${fiche.p.toLowerCase()}.` : ""}
                {fiche?.t?.length ? ` Obligations : ${fiche.t.map((t) => TYPES[t]?.label.toLowerCase() ?? t).join(", ")}.` : ""}
              </p>
            ) : null}
            <label>
              <span>Résumé des exigences</span>
              <textarea rows={4} value={l.resume || proposed.resume} onChange={(e) => set({ resume: e.target.value })} disabled={!editable} />
            </label>
            {fiche?.o?.length ? (
              <details className="registre-details">
                <summary>Articles cités par le texte</summary>
                <ul className="registre-history">
                  {fiche.o.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {l.conformite === "" ? (
              <label>
                <span>Risque en cas de non-conformité</span>
                <textarea rows={2} value={l.risque || proposed.risque} onChange={(e) => set({ risque: e.target.value })} disabled={!editable} />
              </label>
            ) : null}
          </details>

          <details className="panel-section panel-details" open={!!l.historique?.length || undefined}>
            <summary>
              Historique
              {l.historique?.length ? ` (${l.historique.length})` : ""}
            </summary>
            {l.historique?.length ? (
              <ol className="history">
                {[...l.historique].reverse().map((e) => (
                  <li key={e.id}>
                    <span className={`pill ${e.conformite === "C" ? "pill-ok" : e.conformite === "NC" ? "pill-bad" : "pill-muted"}`}>{CONFORMITES[e.conformite]}</span>
                    <span className="history-meta">
                      {dateFr(e.date)}
                      {e.par ? ` · ${e.par}` : ""}
                    </span>
                    {e.commentaire ? <p>{e.commentaire}</p> : null}
                    {e.preuves.length ? (
                      <ul className="evidence-list">
                        {e.preuves.map((p) => (
                          <li key={p.id} className={p.texte ? "is-note" : undefined}>
                            <Icon name={p.path ? "file" : p.texte ? "note" : "link"} size={16} />
                            {p.texte ? (
                              <span>
                                <strong>{p.nom}</strong> {p.texte}
                              </span>
                            ) : linkOf(p) ? (
                              <a href={linkOf(p)} target="_blank" rel="noreferrer">
                                {p.nom}
                              </a>
                            ) : (
                              <span>{p.nom}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Aucune évaluation enregistrée pour l’instant.</p>
            )}
          </details>

          <details className="panel-section panel-details">
            <summary>Pourquoi ce texte, et ses modifications</summary>
            <p className="small">
              {l.origine === "ajoute" ? "Ajouté à la main." : `Pourquoi : ${l.raisons.join(", ")}.`}
              {raisons?.length ? ` Importance : ${raisons.slice(0, 4).join(" · ")}.` : ""}
            </p>
            {history.length ? (
              <ul className="registre-history">
                {history.map((a) => (
                  <li key={a.id}>
                    <a href={a.pdf} target="_blank" rel="noreferrer" dir="auto">
                      {a.title}
                    </a>{" "}
                    <span className="muted small">
                      JORT n° {a.issue}/{a.year}, p. {a.page}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Aucune modification relevée au JORT.</p>
            )}
            {editable ? (
              <button type="button" className="secondary-button" onClick={() => set({ retenu: !l.retenu })}>
                {l.retenu ? "Retirer du registre" : "Retenir dans le registre"}
              </button>
            ) : null}
          </details>
        </div>
      </div>
    </div>
  );
}

/** Something waiting in the register; a long list shows its first items until asked for the rest. */
function ToDo({ className, title, note, action, children }: { className: string; title: string; note?: string; action?: ReactNode; children: ReactNode[] }) {
  const [all, setAll] = useState(false);
  const FIRST = 3;
  return (
    <section className={`card registre-todo ${className}`}>
      <div className="registre-todo-head">
        <h2>{title}</h2>
        {action}
      </div>
      {note ? <p className="muted small">{note}</p> : null}
      <ul>{all ? children : children.slice(0, FIRST)}</ul>
      {children.length > FIRST ? (
        <button type="button" className="edii-link" onClick={() => setAll(!all)}>
          {all ? "Réduire" : `Voir les ${children.length - FIRST} autres`}
        </button>
      ) : null}
    </section>
  );
}
