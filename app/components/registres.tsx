"use client";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { download, downloadWorkbook, today } from "@/app/components/download";
import { FLAG_GROUPS, FLAGS, type Site } from "@/lib/registre/profil";
import { proposals, type Texte } from "@/lib/registre/referentiel";
import {
  addTexte,
  alertes,
  modifiePar,
  backup,
  CONFORMITES,
  type Conformite,
  createRegistre,
  dues,
  ETATS,
  FREQUENCES,
  type Ligne,
  loadRegistres,
  nouveautes,
  plusApplicables,
  prochaine,
  type Registre,
  restore,
  sameName,
  saveRegistres,
  siteFromReport,
  texteFromAmendment,
  updateFromReport,
} from "@/lib/registre/registre";
import { categoryLabel, type ClassificationReport } from "@/lib/report";
import { SECTORS } from "@/lib/sectors";
import { study } from "@/lib/studies";
import { fillRegister, ligneRow } from "@/lib/veille/registre";
import { type Amendment, fold, rules } from "@/lib/veille/watch";

const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const refOf = (t: Texte) => [t.type, t.numero ? `n° ${t.numero}` : "", t.date ? `du ${dateFr(t.date)}` : ""].filter(Boolean).join(" ");

/** Registers live in this browser: loaded once, saved on every change. */
function useRegistres(): [Registre[], (fn: (list: Registre[]) => Registre[]) => void, boolean, boolean] {
  const [list, setList] = useState<Registre[]>([]);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false);
  useEffect(() => {
    setList(loadRegistres());
    setLoaded(true);
  }, []);
  // Saved after rendering: saving tells the rest of the page (the menu's badge), which must not
  // change while this renders.
  useEffect(() => {
    if (!changed.current) return;
    changed.current = false;
    setSaved(saveRegistres(list));
  }, [list]);
  const update = (fn: (list: Registre[]) => Registre[]) => {
    changed.current = true;
    setList(fn);
  };
  return [list, update, saved, loaded];
}

export function Registres({
  seed,
  onSeedUsed,
  texts,
  amendments,
}: {
  seed: ClassificationReport | null;
  onSeedUsed: () => void;
  texts: Texte[];
  amendments: Amendment[];
}) {
  const [list, update, saved, loaded] = useRegistres();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ report: ClassificationReport; site: Site; nom: string } | null>(null);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!seed || !loaded) return;
    // The same establishment already has a register: start from its profile, to update it.
    const existing = sameName(list, seed.name);
    setDraft({ report: seed, site: existing ? updateFromReport(existing, seed).site : siteFromReport(seed), nom: seed.name });
    setOpenId(null);
    setMessage("");
    onSeedUsed();
  }, [seed, onSeedUsed, loaded, list]);

  const open = list.find((r) => r.id === openId);
  const change = (id: string) => (fn: (r: Registre) => Registre) =>
    update((all) => all.map((r) => (r.id === id ? { ...fn(r), maj: new Date().toISOString() } : r)));

  if (draft) {
    const nom = draft.nom.trim();
    const report = { ...draft.report, name: nom };
    const existing = sameName(list, nom);
    const create = () => {
      const reg = createRegistre(report, draft.site, texts);
      update((all) => [reg, ...all]);
      setDraft(null);
      setOpenId(reg.id);
    };
    return (
      <section className="card registre-new" aria-labelledby="registre-new-title">
        <p className="eyebrow">{existing ? "Registre existant" : "Nouveau registre"}</p>
        <label className="registre-name">
          <span id="registre-new-title">Nom de l’établissement</span>
          <input value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} placeholder="Nom de l’établissement" required />
        </label>
        <p>
          Le classement donne la catégorie, les rubriques et l’étude ANPE. Complétez le profil du site : chaque réponse ajoute les
          textes qui s’y rapportent.
        </p>
        <Profil site={draft.site} onChange={(site) => setDraft({ ...draft, site })} />
        {existing ? (
          <div className="registre-existing" role="status">
            <p>
              Un registre « {existing.nom} » existe déjà (créé le {dateFr(existing.cree.slice(0, 10))},{" "}
              {existing.lignes.filter((l) => l.retenu).length} textes). Le mettre à jour garde ses évaluations : les textes que le
              nouveau classement rend applicables vous sont proposés, ceux qui ne s’appliquent plus sont signalés.
            </p>
            <div className="registre-actions">
              <button
                type="button"
                onClick={() => {
                  update((all) => all.map((r) => (r.id === existing.id ? { ...updateFromReport(r, report), site: draft.site } : r)));
                  setDraft(null);
                  setOpenId(existing.id);
                }}
              >
                Mettre à jour ce registre
              </button>
              <button type="button" className="secondary-button" onClick={create}>
                Créer un autre registre
              </button>
              <button type="button" className="secondary-button" onClick={() => setDraft(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="registre-actions">
            <button type="button" disabled={!nom} onClick={create}>
              Créer le registre ({texts.length ? `${countProposed(texts, draft.site)} textes proposés` : "référentiel vide"})
            </button>
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>
              Annuler
            </button>
            {!nom ? <span className="muted small">Donnez un nom à l’établissement.</span> : null}
          </div>
        )}
      </section>
    );
  }

  if (open)
    return (
      <RegistreView
        reg={open}
        change={change(open.id)}
        texts={texts}
        amendments={amendments}
        onBack={() => setOpenId(null)}
        saved={saved}
      />
    );

  return (
    <div className="registres">
      {!saved ? (
        <p className="registre-warning" role="alert">
          Ce navigateur n’enregistre pas les registres (navigation privée ou stockage bloqué) : sauvegardez-les dans un fichier.
        </p>
      ) : null}
      {list.length ? (
        <ul className="registre-list">
          {list.map((r) => {
            const retenus = r.lignes.filter((l) => l.retenu);
            const a = alertes(r, amendments).length;
            const d = dues(r).length;
            const nc = retenus.filter((l) => l.conformite === "NC").length;
            return (
              <li key={r.id} className="card registre-card">
                <div>
                  <h3>{r.nom}</h3>
                  <p className="muted small">
                    {categoryLabel(r.classe)}
                    {r.etude ? ` · ${study(r.etude, false).title}` : ""} · mis à jour le {dateFr(r.maj.slice(0, 10))}
                  </p>
                  <p className="registre-counts">
                    <span>{retenus.length} textes</span>
                    {nc ? <span className="is-nc">{nc} non conformes</span> : null}
                    {d ? <span className="is-due">{d} évaluations à faire</span> : null}
                    {a ? <span className="is-alert">{a} modifiés au JORT</span> : null}
                  </p>
                </div>
                <div className="registre-card-actions">
                  <button type="button" onClick={() => setOpenId(r.id)}>
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (confirm(`Supprimer le registre « ${r.nom} » de ce navigateur ? Cette action est définitive.`))
                        update((all) => all.filter((x) => x.id !== r.id));
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <article className="card veille-empty">
          <h2>Aucun registre pour l’instant</h2>
          <p>
            Classez un établissement dans « Mon établissement », validez la synthèse, puis choisissez « Créer le registre de veille ».
            Les textes qui s’appliquent au site sont proposés d’office.
          </p>
        </article>
      )}
      <div className="registre-backup">
        <button
          type="button"
          className="secondary-button"
          disabled={!list.length}
          onClick={() => download(backup(list), `registres_${today()}.json`, "application/json")}
        >
          Sauvegarder les registres (fichier)
        </button>
        <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
          Restaurer une sauvegarde
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const text = await file.text();
              update((all) => restore(all, text));
              setMessage("Sauvegarde restaurée.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Fichier illisible.");
            }
          }}
        />
        <span className="muted small" aria-live="polite">
          {message || "Les registres sont gardés dans ce navigateur : sauvegardez-les régulièrement."}
        </span>
      </div>
    </div>
  );
}

const countProposed = (texts: Texte[], site: Site) => proposals(texts, site).filter((p) => p.proposed).length;

/** The facts of the site that choose its texts: from the classification, then the consultant's answers. */
function Profil({ site, onChange }: { site: Site; onChange: (site: Site) => void }) {
  const toggle = (id: string) =>
    onChange({ ...site, flags: site.flags.includes(id) ? site.flags.filter((f) => f !== id) : [...site.flags, id] });
  return (
    <div className="registre-profil">
      <dl className="registre-facts">
        <div>
          <dt>Catégorie</dt>
          <dd>{categoryLabel(site.classe)}</dd>
        </div>
        <div>
          <dt>Étude ANPE</dt>
          <dd>{site.etude ? study(site.etude, false).title : "À définir"}</dd>
        </div>
        <div>
          <dt>Secteurs</dt>
          <dd>{site.sections.map((s) => SECTORS[s]?.[0] ?? s).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Rubriques</dt>
          <dd>{site.rubriques.join(", ") || "—"}</dd>
        </div>
      </dl>
      <label className="registre-effectif">
        <span>Effectif (nombre de salariés)</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={site.effectif ?? ""}
          onChange={(e) => onChange({ ...site, effectif: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          placeholder="0 si aucun salarié"
        />
      </label>
      {FLAG_GROUPS.map((group) => (
        <fieldset key={group} className="registre-flags">
          <legend>{group}</legend>
          {FLAGS.filter((f) => f.group === group).map((f) => (
            <label key={f.id}>
              <input type="checkbox" checked={site.flags.includes(f.id)} onChange={() => toggle(f.id)} />
              <span>{f.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

type Filtre = "tous" | "nc" | "dues" | "suggestions";

function RegistreView({
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
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [domaine, setDomaine] = useState("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState("");
  const [exporting, setExporting] = useState(false);

  const retenus = reg.lignes.filter((l) => l.retenu);
  const alerts = alertes(reg, amendments);
  const gone = plusApplicables(reg);
  const news = useMemo(() => nouveautes(reg, texts), [reg, texts]);
  const due = dues(reg);
  const count = (c: Conformite) => retenus.filter((l) => l.conformite === c).length;
  const domains = Object.keys(rules.domains).filter((d) => reg.lignes.some((l) => l.texte.domaine === d));

  const setLigne = (id: string, patch: Partial<Ligne>) => change((r) => setOn(r, id, patch));

  const shown = reg.lignes.filter((l) => {
    const q = fold(query);
    if (filtre === "suggestions" ? l.retenu : !l.retenu) return false;
    if (filtre === "nc" && l.conformite !== "NC") return false;
    if (filtre === "dues" && prochaine(l).etat === "a-jour") return false;
    if (domaine !== "all" && l.texte.domaine !== domaine) return false;
    return !q || fold(`${l.texte.titre} ${l.texte.theme} ${l.resume}`).includes(q);
  });

  const filtering = !!query || domaine !== "all" || filtre !== "tous";
  const groups = Object.keys(rules.domains)
    .map((d) => [d, shown.filter((l) => l.texte.domaine === d)] as const)
    .concat([["autres", shown.filter((l) => !(l.texte.domaine in rules.domains))] as const])
    .filter(([, lignes]) => lignes.length);

  const candidates = useMemo(() => {
    const q = fold(adding);
    if (q.length < 3) return [];
    const inRegister = new Set(reg.lignes.filter((l) => l.retenu).map((l) => l.texte.id));
    return texts.filter((t) => !inRegister.has(t.id) && fold(`${t.titre} ${t.theme} ${t.numero ?? ""}`).includes(q)).slice(0, 12);
  }, [adding, texts, reg.lignes]);

  return (
    <div className="registre">
      <button type="button" className="edii-link registre-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Tous les registres
      </button>
      <header className="card registre-head">
        <label className="registre-name">
          <span className="visually-hidden">Nom de l’établissement</span>
          <input value={reg.nom} onChange={(e) => change((r) => ({ ...r, nom: e.target.value }))} />
        </label>
        <p className="muted small">
          {categoryLabel(reg.classe)}
          {reg.etude ? ` · ${study(reg.etude, false).title}` : ""} · rubriques {reg.activites.map((a) => a.code).join(", ")} · créé le{" "}
          {dateFr(reg.cree.slice(0, 10))}
          {reg.restauration ? (
            <>
              {" · "}
              <a href={reg.restauration}>revoir le classement</a>
            </>
          ) : null}
        </p>
        {!saved ? <p className="registre-warning">Non enregistré dans ce navigateur : sauvegardez dans un fichier.</p> : null}
        <section className="veille-summary registre-summary" aria-label="État du registre">
          <div>
            <strong>{retenus.length}</strong>
            <span>textes applicables</span>
          </div>
          <div>
            <strong>{count("C")}</strong>
            <span>conformes</span>
          </div>
          <div className={count("NC") ? "is-critical" : ""}>
            <strong>{count("NC")}</strong>
            <span>non conformes</span>
          </div>
          <div className={due.length ? "is-due" : ""}>
            <strong>{due.length}</strong>
            <span>évaluations à faire</span>
          </div>
        </section>
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
            <button type="button" className="secondary-button" onClick={() => change((r) => news.reduce((acc, n) => addTexte(acc, n.texte), r))}>
              Tout ajouter
            </button>
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
              <div className="registre-news-actions">
                <button type="button" onClick={() => change((r) => addTexte(r, texte))}>
                  Ajouter
                </button>
                <button type="button" className="secondary-button" onClick={() => change((r) => ({ ...r, ecartes: [...r.ecartes, texte.id] }))}>
                  Écarter
                </button>
              </div>
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
              <div className="registre-news-actions">
                <button type="button" onClick={() => setLigne(l.texte.id, { retenu: false })}>
                  Retirer
                </button>
                <button type="button" className="secondary-button" onClick={() => setLigne(l.texte.id, { garde: true })}>
                  Garder
                </button>
              </div>
            </li>
          ))}
        </ToDo>
      ) : null}

      <details className="card registre-profil-card">
        <summary>Profil du site</summary>
        <Profil site={reg.site} onChange={(site) => change((r) => ({ ...r, site }))} />
      </details>

      <div className="veille-filters" role="group" aria-label="Filtrer le registre">
        <label className="veille-search">
          <span>Rechercher</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titre, thème, exigence…" />
        </label>
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
        <label>
          <span>Afficher</span>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)}>
            <option value="tous">Textes du registre</option>
            <option value="nc">Non conformes</option>
            <option value="dues">Évaluations à faire</option>
            <option value="suggestions">Suggestions non retenues ({reg.lignes.length - retenus.length})</option>
          </select>
        </label>
      </div>

      <div className="veille-toolbar">
        <p className="muted small" aria-live="polite">
          {shown.length} texte{shown.length > 1 ? "s" : ""} affiché{shown.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          className="secondary-button"
          disabled={!retenus.length || exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadWorkbook(
                (wb) => fillRegister(wb, retenus.map(ligneRow), new Date(), reg.nom),
                `ID-QSE-002_${reg.nom.replace(/[^\p{L}\p{N}]+/gu, "_")}_${today()}.xlsx`,
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Préparation du fichier…" : "Exporter le registre (Excel)"}
        </button>
      </div>

      {groups.map(([d, lignes]) => {
        const nc = lignes.filter((l) => l.conformite === "NC").length;
        const todo = lignes.filter((l) => prochaine(l).etat !== "a-jour").length;
        return (
          // Grouped by domain, closed until looked for: a register runs to a hundred texts.
          <details key={`${d}-${filtering}`} className="registre-group" open={filtering || groups.length === 1}>
            <summary>
              <span>{rules.domains[d] ?? d}</span>
              <span className="registre-group-counts">
                {lignes.length} texte{lignes.length > 1 ? "s" : ""}
                {nc ? <b className="is-nc"> · {nc} NC</b> : null}
                {filtre !== "suggestions" && todo ? <b className="is-due"> · {todo} à évaluer</b> : null}
              </span>
            </summary>
            <ol className="registre-lignes">
              {lignes.map((l) => (
                <LigneCard key={l.texte.id} l={l} history={modifiePar(reg, l, amendments)} set={(patch) => setLigne(l.texte.id, patch)} />
              ))}
            </ol>
          </details>
        );
      })}

      <section className="card registre-add" aria-labelledby="add-title">
        <h2 id="add-title">Ajouter un texte</h2>
        <label className="veille-search">
          <span>Rechercher dans le référentiel et le JORT</span>
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Au moins 3 lettres : bruit, 2000-147, chaudière…" />
        </label>
        {candidates.length ? (
          <ul>
            {candidates.map((t) => (
              <li key={t.id}>
                <div>
                  <span>{t.titre}</span>
                  <p className="muted small">
                    {t.theme}
                    {t.publie ? ` · ${t.publie}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => change((r) => addTexte(r, t))}>
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
        ) : adding.length >= 3 ? (
          <p className="muted small">Aucun texte trouvé hors du registre.</p>
        ) : null}
      </section>
    </div>
  );
}

const setOn = (r: Registre, id: string, patch: Partial<Ligne>): Registre => ({
  ...r,
  lignes: r.lignes.map((l) => (l.texte.id === id ? { ...l, ...patch } : l)),
});

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

function LigneCard({ l, history, set }: { l: Ligne; history: Amendment[]; set: (patch: Partial<Ligne>) => void }) {
  const next = prochaine(l);
  return (
    <li className={`card registre-ligne conf-${l.conformite || "none"} ${l.retenu ? "" : "is-left"}`}>
      <div className="registre-ligne-head">
        <label className="registre-retenu">
          <input type="checkbox" checked={l.retenu} onChange={(e) => set({ retenu: e.target.checked })} />
          <span>{l.retenu ? "Retenu" : "Non retenu"}</span>
        </label>
        <span className="badge veille-domain">{l.texte.theme}</span>
        <span className={`badge registre-etat etat-${next.etat}`}>
          {ETATS[next.etat]}
          {next.date ? ` · ${dateFr(next.date)}` : ""}
        </span>
      </div>
      {/* dir="auto": a few texts of the JORT are only in Arabic. */}
      <h3 dir="auto">{l.texte.source ? <a href={l.texte.source} target="_blank" rel="noreferrer">{l.texte.titre}</a> : l.texte.titre}</h3>
      <p className="muted small">
        {l.origine === "ajoute" ? "Ajouté à la main" : `Pourquoi : ${l.raisons.join(", ")}`}
        {l.texte.publie ? ` · ${l.texte.publie}` : ""}
      </p>
      {history.length ? (
        // Modified before the register was made: the text as it stands now, not an alert.
        <details className="registre-details">
          <summary>
            Modifié par {history.length} texte{history.length > 1 ? "s" : ""}
          </summary>
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
        </details>
      ) : null}
      {l.retenu ? (
        <>
          <div className="registre-eval">
            <label>
              <span>Conformité</span>
              <select value={l.conformite} onChange={(e) => set({ conformite: e.target.value as Conformite, evalue: l.evalue || today() })}>
                {Object.entries(CONFORMITES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Dernière évaluation</span>
              <input type="date" value={l.evalue} onChange={(e) => set({ evalue: e.target.value })} />
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
          <details className="registre-details" open={l.conformite === "NC" || undefined}>
            <summary>Exigences, risque et plan d’action</summary>
            <label>
              <span>Résumé des exigences</span>
              <textarea rows={4} value={l.resume} onChange={(e) => set({ resume: e.target.value })} />
            </label>
            <label>
              <span>Risque</span>
              <textarea rows={2} value={l.risque} onChange={(e) => set({ risque: e.target.value })} />
            </label>
            <label>
              <span>Plan d’action en cas de non-conformité</span>
              <textarea rows={2} value={l.plan} onChange={(e) => set({ plan: e.target.value })} />
            </label>
            <div className="registre-eval">
              <label>
                <span>Responsable</span>
                <input value={l.responsable} onChange={(e) => set({ responsable: e.target.value })} />
              </label>
              <label>
                <span>Échéance</span>
                <input type="date" value={l.echeance} onChange={(e) => set({ echeance: e.target.value })} />
              </label>
            </div>
          </details>
        </>
      ) : null}
    </li>
  );
}
