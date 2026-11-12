"use client";
/** What the registers' screens share: dates and labels, the texts' fiches, the site profile form. */
import { useEffect, useState } from "react";
import { FLAG_GROUPS, FLAGS, METIER_GROUPS, METIERS, type Site, toggleMetier } from "@/lib/registre/profil";
import type { Texte } from "@/lib/registre/referentiel";
import type { Registre } from "@/lib/registre/registre";
import { categoryLabel } from "@/lib/report";
import { SECTORS } from "@/lib/sectors";
import { study } from "@/lib/studies";
import type { FicheData } from "@/lib/veille/fiche";

export const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
// A register made without a classification has no rubrique: "À compléter" would mislead.
export const classLabel = (classe: Registre["classe"], rubriques: number) => (classe === null && !rubriques ? "Sans classement" : categoryLabel(classe));
export const refOf = (t: Texte) => [t.type, t.numero ? `n° ${t.numero}` : "", t.date ? `du ${dateFr(t.date)}` : ""].filter(Boolean).join(" ");


/**
 * The texts' fiches (public/veille/fiches.json, written by npm run veille): what each text requires,
 * read from its articles, and the written résumés. Fetched once, when a register is opened.
 */
let fichesRequest: Promise<Record<string, FicheData>> | null = null;
export function useFiches(): Record<string, FicheData> {
  const [fiches, setFiches] = useState<Record<string, FicheData>>({});
  useEffect(() => {
    let live = true;
    fichesRequest ??= fetch("/veille/fiches.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    fichesRequest.then((f) => live && setFiches(f));
    return () => {
      live = false;
    };
  }, []);
  return fiches;
}


/** The facts of the site that choose its texts: from the classification, then the consultant's answers. */
export function Profil({ site, onChange }: { site: Site; onChange: (site: Site) => void }) {
  const toggle = (id: string) =>
    onChange({ ...site, flags: site.flags.includes(id) ? site.flags.filter((f) => f !== id) : [...site.flags, id] });
  return (
    <div className="registre-profil">
      <dl className="registre-facts">
        <div>
          <dt>Catégorie</dt>
          <dd>{classLabel(site.classe, site.rubriques.length)}</dd>
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
      <details className="registre-metiers" open={!site.rubriques.length}>
        <summary>
          Métiers de l’entreprise
          {site.metiers?.length ? ` (${site.metiers.length} choisi${site.metiers.length > 1 ? "s" : ""})` : ""}
        </summary>
        <p className="muted small">
          Un ou plusieurs : chaque métier ajoute les textes de son activité et coche ce qu’il implique d’ordinaire, à corriger
          ci-dessous.
        </p>
        {Object.entries(METIER_GROUPS).map(([id, group]) => (
          <fieldset key={id} className="registre-flags">
            <legend>{group}</legend>
            {METIERS.filter((m) => m.groupe === id).map((m) => (
              <label key={m.id}>
                <input type="checkbox" checked={site.metiers?.includes(m.id) ?? false} onChange={() => onChange(toggleMetier(site, m.id))} />
                <span>{m.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </details>
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

