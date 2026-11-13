"use client";
/** The facts of the site that choose its texts: from the classification, then the consultant's answers. */
import { Checkbox, TextField } from "@/app/ui";
import { classLabel } from "@/lib/registre/labels";
import { FLAG_GROUPS, FLAGS, METIER_GROUPS, METIERS, type Site, toggleMetier } from "@/lib/registre/profil";
import { SECTORS } from "@/lib/sectors";
import { study } from "@/lib/studies";
import s from "./ProfilForm.module.css";

export function ProfilForm({ site, onChange, disabled }: { site: Site; onChange: (site: Site) => void; disabled?: boolean }) {
  const toggle = (id: string) => onChange({ ...site, flags: site.flags.includes(id) ? site.flags.filter((f) => f !== id) : [...site.flags, id] });
  const metiers = site.metiers?.length ?? 0;
  return (
    <div className={s.form} data-ui="">
      <dl className={s.facts}>
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
          <dd>{site.sections.map((x) => SECTORS[x]?.[0] ?? x).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Rubriques</dt>
          <dd>{site.rubriques.join(", ") || "—"}</dd>
        </div>
      </dl>
      <div className={s.effectif}>
        <TextField
          label="Effectif (nombre de salariés)"
          type="number"
          min={0}
          inputMode="numeric"
          value={site.effectif ?? ""}
          onChange={(e) => onChange({ ...site, effectif: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          placeholder="0 si aucun salarié"
          disabled={disabled}
        />
      </div>
      <details className={s.metiers} open={!site.rubriques.length}>
        <summary>
          Métiers de l’entreprise
          {metiers ? ` (${metiers} choisi${metiers > 1 ? "s" : ""})` : ""}
        </summary>
        <div className={s.metiersBody}>
          <p className={s.hint}>Un ou plusieurs : chaque métier ajoute les textes de son activité et coche ce qu’il implique d’ordinaire, à corriger ci-dessous.</p>
          {Object.entries(METIER_GROUPS).map(([id, group]) => (
            <fieldset key={id} className={s.group} disabled={disabled}>
              <legend>{group}</legend>
              <div className={s.options}>
                {METIERS.filter((m) => m.groupe === id).map((m) => (
                  <Checkbox key={m.id} checked={site.metiers?.includes(m.id) ?? false} onChange={() => onChange(toggleMetier(site, m.id))}>
                    {m.label}
                  </Checkbox>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </details>
      {FLAG_GROUPS.map((group) => (
        <fieldset key={group} className={s.group} disabled={disabled}>
          <legend>{group}</legend>
          <div className={s.options}>
            {FLAGS.filter((f) => f.group === group).map((f) => (
              <Checkbox key={f.id} checked={site.flags.includes(f.id)} onChange={() => toggle(f.id)}>
                {f.label}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
