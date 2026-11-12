"use client";
import { useCloud } from "@/app/components/cloud";
import { classLabel, dateFr, Profil } from "@/app/components/registre-shared";
import { RegistreView } from "@/app/components/registre-view";
import { useEffect, useMemo, useRef, useState } from "react";
import { download, today } from "@/app/components/download";
import { EMPTY_SITE, metierLabels, type Site } from "@/lib/registre/profil";
import { proposals, type Texte } from "@/lib/registre/referentiel";
import {
  alertes,
  backup,
  createRegistre,
  dues,
  loadRegistres,
  RELOADED,
  nouveautes,
  type Registre,
  restore,
  sameName,
  saveRegistres,
  siteFromReport,
  updateFromReport,
} from "@/lib/registre/registre";
import type { ClassificationReport } from "@/lib/report";
import { study } from "@/lib/studies";
import type { Amendment } from "@/lib/veille/watch";

/**
 * Registers live in this browser, or in the client workspace when signed in: loaded once (and
 * again when another workspace is opened or a colleague's changes arrive), saved on every change.
 */
function useRegistres(): [Registre[], (fn: (list: Registre[]) => Registre[]) => void, boolean, boolean] {
  const [list, setList] = useState<Registre[]>([]);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false);
  useEffect(() => {
    const reload = () => {
      changed.current = false;
      setList(loadRegistres());
    };
    reload();
    setLoaded(true);
    window.addEventListener(RELOADED, reload);
    return () => window.removeEventListener(RELOADED, reload);
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
  action = null,
  onActionUsed = () => {},
}: {
  seed: ClassificationReport | null;
  onSeedUsed: () => void;
  texts: Texte[];
  amendments: Amendment[];
  /** From the home: open a register, or start one without classification. */
  action?: { open?: string; create?: boolean } | null;
  onActionUsed?: () => void;
}) {
  const cloud = useCloud();
  const [list, update, saved, loaded] = useRegistres();
  const [openId, setOpenId] = useState<string | null>(null);
  // report null: a register without classification (BTP, industry or services the nomenclature does not cover).
  const [draft, setDraft] = useState<{ report: ClassificationReport | null; site: Site; nom: string } | null>(null);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // New texts that apply to each register (a JORT issue read since, a changed profile): shown on its card.
  const news = useMemo(() => new Map(list.map((r) => [r.id, nouveautes(r, texts).length])), [list, texts]);

  useEffect(() => {
    if (!seed || !loaded) return;
    // The same establishment already has a register: start from its profile, to update it.
    const existing = sameName(list, seed.name);
    setDraft({ report: seed, site: existing ? updateFromReport(existing, seed).site : siteFromReport(seed), nom: seed.name });
    setOpenId(null);
    setMessage("");
    onSeedUsed();
  }, [seed, onSeedUsed, loaded, list]);

  useEffect(() => {
    if (!action || !loaded) return;
    if (action.open) setOpenId(action.open);
    if (action.create) {
      setDraft({ report: null, site: EMPTY_SITE, nom: "" });
      setOpenId(null);
    }
    setMessage("");
    onActionUsed();
  }, [action, onActionUsed, loaded]);

  const open = list.find((r) => r.id === openId);
  const change = (id: string) => (fn: (r: Registre) => Registre) =>
    update((all) => all.map((r) => (r.id === id ? { ...fn(r), maj: new Date().toISOString() } : r)));

  if (draft) {
    const nom = draft.nom.trim();
    const report = draft.report ? { ...draft.report, name: nom } : null;
    const existing = sameName(list, nom);
    const create = () => {
      const reg = createRegistre(report, draft.site, texts, undefined, nom);
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
        {report ? (
          <p>
            Le classement donne la catégorie, les rubriques et l’étude ANPE. Complétez le profil du site : chaque réponse ajoute les
            textes qui s’y rapportent.
          </p>
        ) : (
          <p>
            Sans classement : choisissez les métiers de l’entreprise (un ou plusieurs), puis complétez le profil du site. Chaque
            métier ajoute les textes de son activité, et coche ce qu’il implique d’ordinaire (chantier, véhicules…).
          </p>
        )}
        <Profil site={draft.site} onChange={(site) => setDraft({ ...draft, site })} />
        {existing ? (
          <div className="registre-existing" role="status">
            <p>
              Un registre « {existing.nom} » existe déjà (créé le {dateFr(existing.cree.slice(0, 10))},{" "}
              {existing.lignes.filter((l) => l.retenu).length} textes). Le mettre à jour garde ses évaluations : les textes que le
              nouveau profil rend applicables vous sont proposés, ceux qui ne s’appliquent plus sont signalés.
            </p>
            <div className="registre-actions">
              <button
                type="button"
                onClick={() => {
                  update((all) =>
                    all.map((r) => (r.id === existing.id ? { ...(report ? updateFromReport(r, report) : r), site: draft.site } : r)),
                  );
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

  const sansClassement = () => {
    setDraft({ report: null, site: EMPTY_SITE, nom: "" });
    setMessage("");
  };

  return (
    <div className="registres">
      <div className="registre-new-actions">
        <button type="button" onClick={sansClassement}>
          Nouveau registre sans classement
        </button>
        <span className="muted small">
          BTP, travaux routiers, VRD, industrie, services : tout établissement que la nomenclature ne classe pas, ou pas encore.
        </span>
      </div>
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
                    {classLabel(r.classe, r.activites.length)}
                    {metierLabels(r.site).length ? ` · ${metierLabels(r.site).join(", ")}` : ""}
                    {r.etude ? ` · ${study(r.etude, false).title}` : ""} · mis à jour le {dateFr(r.maj.slice(0, 10))}
                  </p>
                  <p className="registre-counts">
                    <span>{retenus.length} textes</span>
                    {nc ? <span className="is-nc">{nc} non conformes</span> : null}
                    {d ? <span className="is-due">{d} évaluations à faire</span> : null}
                    {a ? <span className="is-alert">{a} modifiés au JORT</span> : null}
                    {news.get(r.id) ? (
                      <span className="is-alert">
                        {news.get(r.id) === 1 ? "1 nouveau texte à examiner" : `${news.get(r.id)} nouveaux textes à examiner`}
                      </span>
                    ) : null}
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
          <p>
            Pour une entreprise que la nomenclature ne classe pas (bâtiment, travaux routiers, VRD, industrie, services), choisissez
            « Nouveau registre sans classement » et ses métiers.
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
          {message ||
            (cloud.current
              ? `Les registres sont enregistrés dans l’espace « ${cloud.current.name} », pour tous ses membres. Le fichier de sauvegarde en garde une copie.`
              : "Les registres sont gardés dans ce navigateur : sauvegardez-les régulièrement.")}
        </span>
      </div>
    </div>
  );
}

const countProposed = (texts: Texte[], site: Site) => proposals(texts, site).filter((p) => p.proposed).length;

