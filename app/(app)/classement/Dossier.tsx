"use client";
/**
 * The establishment's dossier: its activities with their case and quantity, the category they give
 * (with the addition rule), and the ANPE study (decree n° 2005-1991).
 */
import { X } from "lucide-react";
import { Badge, Button, Checkbox, Input, Notice, Panel, Select, SelectField, table } from "@/app/ui";
import { additionGroup, rubrique, variants } from "@/lib/classify";
import { type Activity, type ActivityResult, type AdditionResult, type EstablishmentResult, fmtRatio } from "@/lib/establishment";
import { eie, eieEntry, entriesFor, establishmentStudy, SITUATIONS, type Situation, type StudyKind } from "@/lib/studies";
import s from "./classement.module.css";
import { ClasseBadge, entryLabel, entryRef, fmtQty, LABEL, listFr, ordinal } from "./shared";

export function Establishment({
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
    <Panel
      title={`Activités (${est.results.length})`}
      actions={
        <Button size="sm" variant="ghost" onClick={clear}>
          Tout retirer
        </Button>
      }
      padded={false}
    >
      <div className={s.panelBody}>
        <div className={s.verdict}>
          {est.classe === null ? (
            <span className={s.note}>Complétez les activités pour obtenir le classement.</span>
          ) : (
            <>
              <ClasseBadge classe={est.classe} />
              <div>
                <span>
                  {est.complete
                    ? `Catégorie de l’établissement, déterminée par ${listFr(est.decidedBy)}.`
                    : `Au moins cette catégorie (par ${listFr(est.decidedBy)}) : des activités restent à compléter et peuvent la relever.`}
                </span>
                <span className={s.note}>
                  L’établissement prend la catégorie la plus élevée de ses activités : il dépose une seule demande pour l’ensemble (décret n° 2006-2687, art. 5).
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={`${table.table} ${table.stack}`}>
          <thead>
            <tr>
              <th>Rubrique</th>
              <th>Cas et quantité</th>
              <th>Classement</th>
              <th>
                <span className="visually-hidden">Retirer</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {est.results.map((r, i) => (
              <ActivityRow key={i} r={r} update={(p) => update(i, p)} remove={() => remove(i)} open={open} />
            ))}
          </tbody>
        </table>
      </div>
      {est.additions.map((a) => (
        <Addition key={a.group} a={a} />
      ))}
    </Panel>
  );
}

function ActivityRow({ r, update, remove, open }: { r: ActivityResult; update: (p: Partial<Activity>) => void; remove: () => void; open: (code: string) => void }) {
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
      <td data-slot="main">
        <button type="button" className={s.link} onClick={() => open(r.rub.code)}>
          <span className={s.mono}>{r.rub.code}</span> {r.rub.title}
        </button>
        {group ? (
          <span className={table.secondary} title="Règle d'addition, arrêté du 23 février 2010, art. 2 bis">
            Règle d’addition, groupe {group}
          </span>
        ) : null}
      </td>
      <td data-slot="meta">
        <div className={s.cell}>
          {cases.length > 1 ? (
            <Select
              aria-label={`Cas pour ${r.rub.code}`}
              value={r.variant === undefined ? "" : String(cases.indexOf(r.variant))}
              onChange={(e) => update({ variant: e.target.value === "" ? undefined : Number(e.target.value), picked: undefined })}
            >
              <option value="">Choisir le cas…</option>
              {cases.map((v, i) => (
                <option key={i} value={i}>
                  {caseLabel(v)}
                </option>
              ))}
            </Select>
          ) : null}
          {r.units.length && !r.needsVariant ? (
            <div className={s.qty}>
              <Input
                inputMode="decimal"
                value={r.activity.quantity ?? ""}
                placeholder="Quantité"
                aria-label={`Quantité pour ${r.rub.code}`}
                onChange={(e) => update({ quantity: e.target.value, picked: undefined })}
              />
              <Select value={r.unit} onChange={(e) => update({ unit: e.target.value, picked: undefined })} aria-label="Unité">
                {r.units.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </td>
      <td data-slot="side">
        <div className={s.cell}>
          {r.classe !== null ? <ClasseBadge classe={r.classe} /> : null}
          {r.needsVariant ? <span className={s.note}>Choisir le cas</span> : null}
          {o?.status === "needs_quantity" ? <span className={s.note}>Saisir la quantité</span> : null}
          {o?.status === "unit_mismatch" ? <span className={s.note} style={{ color: "var(--ui-danger)" }}>{o.reason}</span> : null}
          {o?.status === "definition" ? (
            <span className={s.note}>
              Définition, voir{" "}
              {o.related.map((c) => (
                <button key={c} type="button" className={s.link} onClick={() => open(c)}>
                  {c}
                </button>
              ))}
            </span>
          ) : null}
          {o?.status === "choose" ? (
            <Select
              value={r.activity.picked === undefined ? "" : String(r.activity.picked)}
              onChange={(e) => update({ picked: e.target.value === "" ? undefined : Number(e.target.value) })}
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
              {o.belowAll ? <option value={-1}>Aucun de ces cas : non classé</option> : null}
            </Select>
          ) : null}
          {r.item ? <span className={s.note}>{r.item.criterion}</span> : null}
        </div>
      </td>
      <td data-slot="hide" style={{ width: 44 }}>
        <Button variant="ghost" size="sm" icon onClick={remove} aria-label={`Retirer ${r.rub.code}`}>
          <X size={15} />
        </Button>
      </td>
    </tr>
  );
}

function Addition({ a }: { a: AdditionResult }) {
  return (
    <div className={s.addition}>
      <h3>
        Règle d’addition, groupe {a.group} {a.upgraded ? <Badge tone="warning">relève la catégorie</Badge> : null}
      </h3>
      <p className={s.note}>
        Arrêté du 23 février 2010, art. 2 bis : l’établissement détient plusieurs substances du groupe {a.group}. Prises une à une, elles le classent au plus en{" "}
        {ordinal(a.base)}
        {a.target ? ` ; chaque quantité qx est comparée au seuil Qx de la ${ordinal(a.target)} catégorie.` : "."}
      </p>
      {a.target ? (
        <div className={`${table.wrap} ${s.tableWrap}`}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Rubrique</th>
                <th className={table.num}>qx</th>
                <th className={table.num}>Qx ({ordinal(a.target)})</th>
                <th className={table.num}>qx / Qx</th>
              </tr>
            </thead>
            <tbody>
              {a.members.map((m, i) => (
                <tr key={i}>
                  <td>
                    <span className={s.mono}>{m.result.rub.code}</span> {m.result.rub.title}
                  </td>
                  <td className={table.num}>{m.result.q ? fmtQty(m.result.q.value, m.result.q.unit) : "—"}</td>
                  <td className={table.num}>{m.Q !== null && m.result.q ? fmtQty(m.Q, m.result.q.unit) : <span className={s.note}>{m.note}</span>}</td>
                  <td className={table.num}>{m.ratio !== null ? fmtRatio(m.ratio) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>Σ qx / Qx</strong>
                </td>
                <td className={table.num}>
                  <strong>{fmtRatio(a.sum)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      <p className={s.verdict}>
        {a.upgraded ? <ClasseBadge classe={a.target!} /> : null} <span>{a.reason}</span>
      </p>
    </div>
  );
}

const STUDY_SHORT: Record<StudyKind, string> = {
  eie_a: "EIE catégorie A",
  eie_b: "EIE catégorie B",
  cahier_des_charges: "Cahier des charges",
  depollution: "Étude de dépollution",
  demande_avis: "Demande d'avis",
};

export function Study({
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
    <Panel title="Étude environnementale (ANPE)" actions={<span className={s.note}>Décret n° 2005-1991 du 11 juillet 2005</span>} padded={false}>
      <div className={s.panelBody}>
        <SelectField id="establishment-situation" label="Situation de l’établissement" value={situation} onChange={(e) => setSituation(e.target.value as Situation)}>
          {Object.entries(SITUATIONS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
        <Checkbox checked={sensitive} onChange={(e) => setSensitive(e.target.checked)}>
          Le site peut affecter une zone protégée ou sensible (forêts, paysages naturels ou historiques, parcs, espaces protégés, faune et flore)
        </Checkbox>
      </div>
      <div className={s.tableWrap}>
        <table className={`${table.table} ${table.stack}`}>
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
              const variant = cases.length === 1 ? cases[0] : a.variant !== undefined ? cases[a.variant] : undefined;
              const { suggested, note, others } = entriesFor(a.code, variant);
              const kind = result.perActivity[i];
              const entry = eieEntry(a.eie);
              return (
                <tr key={i}>
                  <td data-slot="main">
                    <span className={s.mono}>{rub.code}</span> {rub.title}
                  </td>
                  <td data-slot="meta">
                    <div className={s.cell}>
                      <Select
                        value={a.eie && (a.eie === "none" || entry) ? a.eie : ""}
                        onChange={(e) => update(i, { eie: e.target.value || undefined })}
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
                          <option value="none">Aucune entrée propre (activité annexe, ou dans aucune annexe)</option>
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
                      </Select>
                      {entry ? (
                        <span className={s.note}>{entry.text}</span>
                      ) : a.eie === "none" ? null : (
                        <ul className={s.suggest}>
                          {suggested.map(({ entry: e, when }) => (
                            <li key={e.id}>
                              <button type="button" className={s.link} onClick={() => update(i, { eie: e.id })}>
                                {entryRef(e.id)}
                              </button>{" "}
                              {when}
                            </li>
                          ))}
                          <li>
                            <button type="button" className={s.link} onClick={() => update(i, { eie: "none" })}>
                              Aucune entrée propre
                            </button>{" "}
                            {note ?? "si aucune suggestion ne s'applique : l'activité est annexe à l'activité principale de l'unité, ou ne figure dans aucune annexe."}
                          </li>
                        </ul>
                      )}
                    </div>
                  </td>
                  <td data-slot="side">{kind ? <Badge tone="accent">{STUDY_SHORT[kind]}</Badge> : <span className={s.note}>à choisir</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={s.panelBody}>
        <details className={s.details}>
          <summary>Comment les entrées sont suggérées</summary>
          Le décret classe les unités selon leur activité principale ; la nomenclature, les activités et substances qu’elles contiennent. Les suggestions rapprochent
          les deux textes avec la condition dont elles dépendent : c’est une lecture, à confirmer pour chaque activité.
        </details>
        {result.study ? (
          <>
            <div className={s.verdict}>
              <Badge tone="accent" dot>
                {result.study.title}
              </Badge>
              <div>
                {result.study.delay ? <span>Délai de l’ANPE : {result.study.delay}</span> : null}
                {activities.length > 1 && new Set(result.perActivity).size > 1 ? (
                  <span className={s.note}>L’établissement retient l’étude la plus exigeante de ses activités.</span>
                ) : null}
              </div>
            </div>
            <details className={s.details}>
              <summary>
                Les démarches ({result.study.steps.length} étape{result.study.steps.length > 1 ? "s" : ""})
              </summary>
              <ol>
                {result.study.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p>Base : {result.study.basis}.</p>
            </details>
            {result.study.kind === "depollution" ? (
              <Notice tone="warning" title="Régularisation à vérifier">
                La circulaire n° 27 du 7 novembre 2024 ouvrait cette régularisation jusqu’au 31 décembre 2025 : vérifier auprès de l’ANPE qu’elle est toujours en vigueur.
              </Notice>
            ) : null}
          </>
        ) : (
          <p className={s.note}>
            {result.missing === 1 ? "Choisissez l’entrée du décret de l’activité restante" : `Choisissez l’entrée du décret des ${result.missing} activités restantes`} pour
            connaître l’étude à fournir.
          </p>
        )}
      </div>
    </Panel>
  );
}
