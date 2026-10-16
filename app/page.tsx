"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
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
import { eie, eieEntry, entriesFor, establishmentStudy, SITUATIONS, type Situation, type StudyKind } from "@/lib/studies";

const LABEL: Record<string, string> = { "1": "1ère catégorie", "2": "2ème catégorie", "3": "3ème catégorie", NC: "Non classé" };
const SOURCE = Object.fromEntries(nomenclature.sources.map((s) => [s.id, s]));
const ordinal = (c: Classe) => (c === "NC" ? "non classé" : `${c}${c === 1 ? "ère" : "ème"}`);

function ClasseBadge({ classe, big }: { classe: Classe; big?: boolean }) {
  return <span className={`badge edii-c${classe} ${big ? "edii-big" : ""}`}>{LABEL[String(classe)]}</span>;
}

export default function EdiiPage() {
  return (
    <Suspense fallback={<div className="center muted">Chargement…</div>}>
      <Edii />
    </Suspense>
  );
}

function Edii() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [section, setSection] = useState<string | null>(null);
  const [code, setCode] = useState(params.get("code"));
  const [activities, setActivities] = useState<Activity[]>(() => decodeActivities(params.get("e")));
  const [situation, setSituation] = useState<Situation>(() => {
    const s = params.get("s");
    return s && s in SITUATIONS ? (s as Situation) : "projet";
  });
  const [sensitive, setSensitive] = useState(params.get("z") === "1");
  const selected = rubrique(code ?? "");
  const est = useMemo(() => classifyEstablishment(activities), [activities]);

  // The state lives here; the URL follows it, so a classification can be bookmarked or shared.
  // (Reading the list back from the URL on each change would lose edits made in quick succession.)
  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (activities.length) p.set("e", encodeActivities(activities));
    if (activities.length && situation !== "projet") p.set("s", situation);
    if (activities.length && sensitive) p.set("z", "1");
    if (query.trim()) p.set("q", query.trim());
    router.replace(p.size ? `/?${p}` : "/", { scroll: false });
  }, [code, activities, situation, sensitive, query, router]);

  const results = useMemo(() => {
    if (query.trim()) return search(query, 60);
    if (section) return nomenclature.rubriques.filter((r) => r.section === section);
    return [];
  }, [query, section]);

  const open = (c: string) => setCode(c);
  const add = (c: string) => setActivities((list) => [...list, { code: c }]);
  const update = (i: number, patch: Partial<Activity>) => setActivities((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => setActivities((list) => list.filter((_, j) => j !== i));
  const count = (code: string) => activities.filter((a) => a.code === code).length;

  return (
    <div className="page edii">
      <div className="page-head">
        <div>
          <h1>Classement des établissements dangereux, insalubres ou incommodes</h1>
          <p className="muted">
            Nomenclature de l&apos;arrêté du 15 novembre 2005, consolidée avec les arrêtés du 23 février 2010 et du 24 octobre 2012.{" "}
            {nomenclature.rubriques.length} rubriques.
          </p>
        </div>
      </div>

      <div className="edii-layout">
        <aside className="card edii-list">
          <input
            autoFocus
            className="edii-search"
            placeholder="Activité, substance ou n° de rubrique…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!query.trim() ? (
            <div className="chips edii-sections">
              {Object.entries(nomenclature.sections)
                .filter(([code]) => !code.endsWith("000"))
                .map(([code, title]) => (
                  <button key={code} className={`chip ${section === code ? "on" : ""}`} onClick={() => setSection(section === code ? null : code)}>
                    {code} · {title}
                  </button>
                ))}
            </div>
          ) : null}
          {query.trim() && results.length === 0 ? (
            <p className="muted small">
              Aucune rubrique ne correspond. Une activité qui ne figure dans aucune rubrique de la nomenclature est <b>non classée</b> ;
              essayer d&apos;autres mots (substance, procédé, produit) avant de conclure.
            </p>
          ) : null}
          <ul className="edii-results">
            {results.map((r) => (
              <li key={r.code}>
                <button className={`edii-open ${selected?.code === r.code ? "on" : ""}`} onClick={() => open(r.code)}>
                  <span className="mono">{r.code}</span> {r.title}
                  {r.kind === "definition" ? <span className="tag">définition</span> : null}
                </button>
                {r.kind === "activity" ? (
                  <button className="edii-add" title="Ajouter à l'établissement" aria-label={`Ajouter ${r.code} à l'établissement`} onClick={() => add(r.code)}>
                    {count(r.code) ? `✓${count(r.code) > 1 ? count(r.code) : ""}` : "+"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>

        <main>
          {activities.length ? (
            <>
              <EstablishmentCard est={est} update={update} remove={remove} clear={() => setActivities([])} open={open} />
              <StudyCard
                activities={activities}
                situation={situation}
                sensitive={sensitive}
                setSituation={setSituation}
                setSensitive={setSensitive}
                update={update}
              />
            </>
          ) : null}
          {selected ? (
            <RubriqueView key={selected.code} rub={selected} count={count(selected.code)} onAdd={() => add(selected.code)} onOpen={open} />
          ) : activities.length ? null : (
            <Intro />
          )}
        </main>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="card">
      <h2>Comment ça marche</h2>
      <ol className="edii-steps">
        <li>Chercher chaque activité ou substance de l&apos;établissement, ou parcourir une section.</li>
        <li>L&apos;ajouter à l&apos;établissement avec « + », puis choisir le cas et saisir la capacité ou la quantité.</li>
        <li>
          Chaque activité est classée d&apos;après les seuils du texte ; l&apos;établissement prend la catégorie la plus élevée, et la règle
          d&apos;addition est appliquée aux substances d&apos;un même groupe.
        </li>
      </ol>
      <p className="muted small">
        Les seuils ont été lus par OCR sur les textes publiés au JORT puis vérifiés (voir <span className="mono">data/review.md</span>). Outil
        d&apos;aide : le texte officiel fait foi.
      </p>
      <h3>Textes</h3>
      <ul className="small">
        {nomenclature.sources.map((s) => (
          <li key={s.id}>
            {s.title} <span className="muted">({s.jort})</span>
          </li>
        ))}
      </ul>
    </div>
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
        <h2>Établissement</h2>
        <button className="ghost small" onClick={clear}>
          Tout retirer
        </button>
      </div>

      <div className="edii-verdict">
        {est.classe === null ? (
          <span className="muted">Compléter les activités pour obtenir le classement.</span>
        ) : (
          <>
            <ClasseBadge classe={est.classe} big />
            <div>
              {est.complete ? (
                <span>Catégorie de l&apos;établissement, déterminée par {listFr(est.decidedBy)}.</span>
              ) : (
                <span>
                  Au moins cette catégorie (par {listFr(est.decidedBy)}) : des activités restent à compléter et peuvent la relever.
                </span>
              )}
              <div className="muted small">
                L&apos;établissement prend la catégorie la plus élevée de ses activités : il dépose une seule demande pour l&apos;ensemble
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
              <ActivityRow key={i} r={r} update={(p) => update(i, p)} remove={() => remove(i)} open={open} />
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
  const caseLabel = (v: string) => v || r.rub.items.filter((i) => i.path.length === 0).map((i) => i.criterion || r.rub.title).join(" / ");
  const o = r.outcome;
  return (
    <tr>
      <td>
        <button className="edii-link" onClick={() => open(r.rub.code)}>
          <span className="mono">{r.rub.code}</span> {r.rub.title}
        </button>
        {group ? <span className="tag" title="Règle d'addition, arrêté du 23 février 2010, art. 2 bis">groupe {group}</span> : null}
      </td>
      <td>
        {cases.length > 1 ? (
          <select
            className="edii-case"
            value={r.variant === undefined ? "" : String(cases.indexOf(r.variant))}
            onChange={(e) => update({ variant: e.target.value === "" ? undefined : Number(e.target.value), picked: undefined })}
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
              onChange={(e) => update({ quantity: e.target.value, picked: undefined })}
            />
            <select value={r.unit} onChange={(e) => update({ unit: e.target.value, picked: undefined })} aria-label="Unité">
              {r.units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        ) : null}
      </td>
      <td>
        {r.classe !== null ? <ClasseBadge classe={r.classe} /> : null}
        {r.needsVariant ? <span className="muted small">Choisir le cas</span> : null}
        {o?.status === "needs_quantity" ? <span className="muted small">Saisir la quantité</span> : null}
        {o?.status === "unit_mismatch" ? <span className="error small">{o.reason}</span> : null}
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
            value={r.activity.picked === undefined ? "" : String(r.activity.picked)}
            onChange={(e) => update({ picked: e.target.value === "" ? undefined : Number(e.target.value) })}
            title={o.reason}
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
          </select>
        ) : null}
        {r.item ? <div className="muted small edii-why">{r.item.criterion}</div> : null}
      </td>
      <td>
        <button className="ghost edii-remove" onClick={remove} aria-label={`Retirer ${r.rub.code}`}>
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
        <span className="muted small">Décret n° 2005-1991 du 11 juillet 2005</span>
      </div>
      <div className="form">
        <div className="field wide">
          <label>Situation de l&apos;établissement</label>
          <select value={situation} onChange={(e) => setSituation(e.target.value as Situation)}>
            {Object.entries(SITUATIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="field wide edii-check">
          <span>
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> Le site peut affecter une zone
            protégée ou sensible (forêts, paysages naturels ou historiques, parcs, espaces protégés, faune et flore)
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
              const variant = cases.length === 1 ? cases[0] : a.variant !== undefined ? cases[a.variant] : undefined;
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
                    </select>
                    {entry ? (
                      <div className="muted small edii-why">{entry.text}</div>
                    ) : a.eie === "none" ? null : (
                      <ul className="edii-suggest">
                        {suggested.map(({ entry: e, when }) => (
                          <li key={e.id}>
                            <button className="edii-link" onClick={() => update(i, { eie: e.id })}>
                              {entryRef(e.id)}
                            </button>{" "}
                            <span className="small">{when}</span>
                          </li>
                        ))}
                        <li>
                          <button className="edii-link" onClick={() => update(i, { eie: "none" })}>
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
                  <td>{kind ? <span className={`badge edii-s-${kind}`}>{STUDY_SHORT[kind]}</span> : <span className="muted small">à choisir</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Le décret classe les unités selon leur activité principale ; la nomenclature, les activités et substances qu&apos;elles
        contiennent. Les suggestions rapprochent les deux textes avec la condition dont elles dépendent : c&apos;est une lecture, à
        confirmer pour chaque activité.
      </p>

      {result.study ? (
        <div className="edii-study-result">
          <div className="edii-verdict">
            <span className={`badge edii-big edii-s-${result.study.kind}`}>{result.study.title}</span>
            {result.study.delay ? <span>Délai de l&apos;ANPE : {result.study.delay}</span> : null}
          </div>
          {activities.length > 1 && new Set(result.perActivity).size > 1 ? (
            <p className="small muted">L&apos;établissement retient l&apos;étude la plus exigeante de ses activités.</p>
          ) : null}
          <ol className="edii-steps small">
            {result.study.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="muted small">Base : {result.study.basis}.</p>
          {result.study.kind === "depollution" ? (
            <p className="edii-note small">
              La circulaire n° 27 du 7 novembre 2024 ouvrait cette régularisation jusqu&apos;au 31 décembre 2025 : vérifier auprès de
              l&apos;ANPE qu&apos;elle est toujours en vigueur.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="muted">
          {result.missing === 1 ? "Choisir l'entrée du décret de l'activité restante" : `Choisir l'entrée du décret des ${result.missing} activités restantes`}{" "}
          pour connaître l&apos;étude à fournir.
        </p>
      )}
    </div>
  );
}

const entryRef = (id: string) => (id.startsWith("CDC") ? `Annexe 2, n° ${id.slice(3)}` : `Annexe 1 cat. ${id[0]}, n° ${id.slice(1)}`);

function entryLabel(id: string, text: string) {
  const short = text.length > 110 ? `${text.slice(0, 110)}…` : text;
  return `${entryRef(id)} · ${short}`;
}

function AdditionPanel({ a }: { a: AdditionResult }) {
  return (
    <div className={`edii-addition ${a.upgraded ? "up" : ""}`}>
      <h3>Règle d&apos;addition, groupe {a.group}</h3>
      <p className="small muted">
        Arrêté du 23 février 2010, art. 2 bis : l&apos;établissement détient plusieurs substances du groupe {a.group}. Prises une à une, elles le
        classent au plus en {ordinal(a.base)}
        {a.target ? ` ; chaque quantité qx est comparée au seuil Qx de la ${ordinal(a.target)} catégorie.` : "."}
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
                  <span className="mono">{m.result.rub.code}</span> {m.result.rub.title}
                </td>
                <td>{m.result.q ? fmtQty(m.result.q.value, m.result.q.unit) : "—"}</td>
                <td>{m.Q !== null && m.result.q ? fmtQty(m.Q, m.result.q.unit) : <span className="muted small">{m.note}</span>}</td>
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

const listFr = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);

function fmtQty(v: number, unit: string) {
  if (unit === "kg" && v >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} t`;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unit}`;
}

function RubriqueView({ rub, count, onAdd, onOpen }: { rub: Rubrique; count: number; onAdd: () => void; onOpen: (code: string) => void }) {
  const group = additionGroup(rub.code);
  const related =
    rub.kind === "definition"
      ? nomenclature.rubriques.filter((r) => r.code !== rub.code && r.code.startsWith(`${rub.code.split(" ")[0]} bis`)).map((r) => r.code)
      : [];
  return (
    <div className="card">
      <div className="edii-head">
        <h2>
          <span className="mono">{rub.code}</span> {rub.title}
        </h2>
        <span className="muted small">
          {rub.replaces ? `Modifiée par l'arrêté de ${rub.source}` : rub.source === "2005" ? "Arrêté de 2005" : `Ajoutée par l'arrêté de ${rub.source}`}
        </span>
      </div>
      <p className="edii-text">{rub.text}</p>
      {group ? (
        <p className="edii-note small">
          Règle d&apos;addition (art. 2 bis, arrêté du 23 février 2010) : groupe {group}. Si l&apos;établissement détient plusieurs substances du
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
                    {it.path.length ? <div className="muted small">{it.path.join(" › ")}</div> : null}
                    {it.criterion || rub.title}
                  </td>
                  <td>
                    {describe(it.condition)}
                    {it.condition?.unit_inferred ? <span className="tag" title="Unité déduite des autres lignes">déduite</span> : null}
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
          <button onClick={onAdd}>{count ? "Ajouter encore à l'établissement" : "Ajouter à l'établissement"}</button>
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
        {rub.items[0] ? <span className="muted small">Source : {sourceOf(rub.items[0])}</span> : null}
      </div>
    </div>
  );
}

function sourceOf(it: Item): string {
  const id = it.ref.split(" ")[0];
  const s = SOURCE[id];
  const page = it.ref.match(/p\.(\d+)/)?.[1];
  return s ? `${s.title.split(",")[0]} (${s.jort})${page ? `, page ${page} du PDF` : ""}` : it.ref;
}
