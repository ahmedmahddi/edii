"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { download, downloadWorkbook, today } from "@/app/components/download";
import { FLAG_GROUPS, FLAGS, type Site } from "@/lib/registre/profil";
import { proposals, type Texte } from "@/lib/registre/referentiel";
import {
  addTexte,
  alertes,
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
  prochaine,
  type Registre,
  restore,
  saveRegistres,
  siteFromReport,
} from "@/lib/registre/registre";
import { categoryLabel, type ClassificationReport } from "@/lib/report";
import { SECTORS } from "@/lib/sectors";
import { study } from "@/lib/studies";
import { fillRegister, ligneRow } from "@/lib/veille/registre";
import { type Amendment, fold, rules } from "@/lib/veille/watch";

const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const refOf = (t: Texte) => [t.type, t.numero ? `n° ${t.numero}` : "", t.date ? `du ${dateFr(t.date)}` : ""].filter(Boolean).join(" ");

/** Registers live in this browser: loaded once, saved on every change. */
function useRegistres(): [Registre[], (fn: (list: Registre[]) => Registre[]) => void, boolean] {
  const [list, setList] = useState<Registre[]>([]);
  const [saved, setSaved] = useState(true);
  useEffect(() => setList(loadRegistres()), []);
  const update = (fn: (list: Registre[]) => Registre[]) =>
    setList((prev) => {
      const next = fn(prev);
      setSaved(saveRegistres(next));
      return next;
    });
  return [list, update, saved];
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
  const [list, update, saved] = useRegistres();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ report: ClassificationReport; site: Site } | null>(null);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!seed) return;
    setDraft({ report: seed, site: siteFromReport(seed) });
    setOpenId(null);
    onSeedUsed();
  }, [seed, onSeedUsed]);

  const open = list.find((r) => r.id === openId);
  const change = (id: string) => (fn: (r: Registre) => Registre) =>
    update((all) => all.map((r) => (r.id === id ? { ...fn(r), maj: new Date().toISOString() } : r)));

  if (draft)
    return (
      <section className="card registre-new" aria-labelledby="registre-new-title">
        <p className="eyebrow">Nouveau registre</p>
        <h2 id="registre-new-title">{draft.report.name || "Établissement sans nom"}</h2>
        <p>
          Le classement donne déjà la catégorie, les rubriques et l’étude ANPE. Complétez le profil du site : chaque réponse ajoute
          les textes qui s’y rapportent.
        </p>
        <Profil site={draft.site} onChange={(site) => setDraft({ ...draft, site })} />
        <div className="registre-actions">
          <button
            type="button"
            onClick={() => {
              const reg = createRegistre(draft.report, draft.site, texts);
              update((all) => [reg, ...all]);
              setDraft(null);
              setOpenId(reg.id);
            }}
          >
            Créer le registre ({texts.length ? `${countProposed(texts, draft.site)} textes proposés` : "référentiel vide"})
          </button>
          <button type="button" className="secondary-button" onClick={() => setDraft(null)}>
            Annuler
          </button>
        </div>
      </section>
    );

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
  const news = useMemo(() => nouveautes(reg, texts), [reg, texts]);
  const due = dues(reg);
  const count = (c: Conformite) => retenus.filter((l) => l.conformite === c).length;
  const domains = Object.keys(rules.domains).filter((d) => reg.lignes.some((l) => l.texte.domaine === d));

  const setLigne = (id: string, patch: Partial<Ligne>) =>
    change((r) => ({ ...r, lignes: r.lignes.map((l) => (l.texte.id === id ? { ...l, ...patch } : l)) }));

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
        <section className="card registre-alerts" aria-labelledby="alerts-title">
          <h2 id="alerts-title">Textes du registre modifiés au JORT ({alerts.length})</h2>
          <ul>
            {alerts.map(({ ligne, amendment }) => (
              <li key={`${ligne.texte.id}-${amendment.id}`}>
                <p>
                  <strong>{refOf(ligne.texte)}</strong> est visé par :{" "}
                  <a href={amendment.pdf} target="_blank" rel="noreferrer">
                    {amendment.title}
                  </a>{" "}
                  <span className="muted small">
                    (JORT n° {amendment.issue}/{amendment.year}, p. {amendment.page})
                  </span>
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLigne(ligne.texte.id, { vus: [...ligne.vus, amendment.id], evalue: "", conformite: "" })}
                >
                  Pris en compte : à réévaluer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {news.length ? (
        <section className="card registre-news" aria-labelledby="news-title">
          <h2 id="news-title">Nouveaux textes pour ce site ({news.length})</h2>
          <p className="muted small">Parus au JORT depuis la création du registre, ou devenus applicables avec le profil du site.</p>
          <ul>
            {news.map(({ texte, reasons }) => (
              <li key={texte.id}>
                <div>
                  <a href={texte.source} target="_blank" rel="noreferrer">
                    {texte.titre}
                  </a>
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
          </ul>
        </section>
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
                <LigneCard key={l.texte.id} l={l} set={(patch) => setLigne(l.texte.id, patch)} />
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

function LigneCard({ l, set }: { l: Ligne; set: (patch: Partial<Ligne>) => void }) {
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
      <h3>{l.texte.source ? <a href={l.texte.source} target="_blank" rel="noreferrer">{l.texte.titre}</a> : l.texte.titre}</h3>
      <p className="muted small">
        {l.origine === "ajoute" ? "Ajouté à la main" : `Pourquoi : ${l.raisons.join(", ")}`}
        {l.texte.publie ? ` · ${l.texte.publie}` : ""}
      </p>
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
