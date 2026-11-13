"use client";
/**
 * A new register: from a validated classification (left by the classification screen), or without
 * one (trades and the site's profile). The same establishment already registered: update it instead.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Notice, PageHeader, Panel, TextField } from "@/app/ui";
import { dateFr } from "@/lib/registre/labels";
import { EMPTY_SITE, type Site } from "@/lib/registre/profil";
import { proposals, type Texte } from "@/lib/registre/referentiel";
import { createRegistre, type Registre, sameName, siteFromReport, updateFromReport } from "@/lib/registre/registre";
import { takePendingSeed } from "@/lib/registre/seed";
import type { ClassificationReport } from "@/lib/report";
import { ProfilForm } from "./ProfilForm";
import s from "./Registres.module.css";

type Draft = { report: ClassificationReport | null; site: Site; nom: string };

export function NouveauRegistre({
  list,
  loaded,
  update,
  texts,
  writable,
  limit,
  onDone,
}: {
  list: Registre[];
  loaded: boolean;
  update: (fn: (list: Registre[]) => Registre[]) => void;
  texts: Texte[];
  writable: boolean;
  limit: string | null;
  /** The register created or updated (its id), or null when cancelled. */
  onDone: (id: string | null) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    const seed = takePendingSeed();
    if (!seed) return setDraft({ report: null, site: EMPTY_SITE, nom: "" });
    // The same establishment already has a register: start from its profile, to update it.
    const existing = sameName(list, seed.name);
    setDraft({ report: seed, site: existing ? updateFromReport(existing, seed).site : siteFromReport(seed), nom: seed.name });
  }, [loaded, list]);
  if (!draft) return null;

  const nom = draft.nom.trim();
  const report = draft.report ? { ...draft.report, name: nom } : null;
  const existing = sameName(list, nom);
  const proposed = texts.length ? proposals(texts, draft.site).filter((p) => p.proposed).length : 0;
  const create = () => {
    const reg = createRegistre(report, draft.site, texts, undefined, nom);
    update((all) => [reg, ...all]);
    onDone(reg.id);
  };
  const updateExisting = () => {
    if (!existing) return;
    update((all) => all.map((r) => (r.id === existing.id ? { ...(report ? updateFromReport(r, report) : r), site: draft.site } : r)));
    onDone(existing.id);
  };

  return (
    <div className={s.screen}>
      <PageHeader
        title={existing ? "Registre existant" : "Nouveau registre"}
        description={
          report
            ? "Le classement donne la catégorie, les rubriques et l’étude ANPE. Complétez le profil du site : chaque réponse ajoute les textes qui s’y rapportent."
            : "Sans classement : choisissez les métiers de l’entreprise (un ou plusieurs), puis complétez le profil du site. Chaque métier ajoute les textes de son activité."
        }
      />
      <Panel>
        <div className={s.form}>
          <div className={s.name}>
            <TextField label="Nom de l’établissement" value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} required autoFocus={!draft.nom} />
          </div>
          {existing ? (
            <Notice tone="warning" title={`Un registre « ${existing.nom} » existe déjà`}>
              Créé le {dateFr(existing.cree.slice(0, 10))}, {existing.lignes.filter((l) => l.retenu).length} textes. Le mettre à jour garde ses évaluations : les
              textes que le nouveau profil rend applicables vous sont proposés, ceux qui ne s’appliquent plus sont signalés.
            </Notice>
          ) : null}
          <ProfilForm site={draft.site} onChange={(site) => setDraft({ ...draft, site })} />
          <div className={s.actions}>
            {existing ? (
              <>
                <Button variant="primary" disabled={!writable} onClick={updateExisting}>
                  Mettre à jour ce registre
                </Button>
                <Button disabled={!writable || !!limit} onClick={create}>
                  Créer un autre registre
                </Button>
              </>
            ) : (
              <Button variant="primary" disabled={!nom || !!limit || !writable || !texts.length} onClick={create}>
                Créer le registre ({texts.length ? `${proposed} textes proposés` : "chargement des textes…"})
              </Button>
            )}
            <Button variant="ghost" onClick={() => onDone(null)}>
              Annuler
            </Button>
            <span className={s.actionsNote}>{!writable ? "Cet espace est en lecture seule." : limit ? limit : !nom ? "Donnez un nom à l’établissement." : ""}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
