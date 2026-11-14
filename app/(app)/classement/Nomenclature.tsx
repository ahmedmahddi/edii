"use client";
/** The nomenclature: search by word or number, browse by sector, and a rubrique's cases and thresholds in a sheet. */
import { ArrowLeft, Check, Plus } from "lucide-react";
import { useMemo } from "react";
import { Badge, Button, EmptyState, Notice, Panel, SearchInput, Sheet, SheetSection, table } from "@/app/ui";
import { additionGroup, describe, nomenclature, type Rubrique, rubrique, search } from "@/lib/classify";
import { SECTORS } from "@/lib/sectors";
import s from "./classement.module.css";
import { ClasseBadge, sourceOf } from "./shared";

export function Nomenclature({
  query,
  setQuery,
  section,
  setSection,
  code,
  setCode,
  count,
  add,
}: {
  query: string;
  setQuery: (q: string) => void;
  section: string | null;
  setSection: (s: string | null) => void;
  code: string | null;
  setCode: (c: string | null) => void;
  count: (code: string) => number;
  add: (code: string) => void;
}) {
  const results = useMemo(() => (query.trim() ? search(query, 60) : section ? nomenclature.rubriques.filter((r) => r.section === section) : []), [query, section]);
  const selected = code ? rubrique(code) : undefined;

  return (
    <div className={s.stack}>
      <SearchInput
        id="activity-search"
        label="Rechercher une activité, une substance ou un numéro de rubrique"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCode(null);
        }}
        placeholder="Une activité, une substance ou un numéro : lait, stockage, 1214…"
      />
      {!query.trim() && !section ? (
        <div className={s.examples}>
          Essayez
          {["lait", "bois", "inflammables"].map((w) => (
            <Button key={w} size="sm" variant="ghost" onClick={() => setQuery(w)}>
              {w}
            </Button>
          ))}
        </div>
      ) : null}

      {query.trim() || section ? (
        <>
          <div className={s.bar}>
            <h2>{query.trim() ? "Résultats" : SECTORS[section!]?.[0]}</h2>
            <span className={s.count} role="status">
              {results.length}
              {query.trim() && results.length === 60 ? "+" : ""} rubrique{results.length > 1 ? "s" : ""}
            </span>
          </div>
          {section && !query.trim() ? (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setSection(null)}>
                <ArrowLeft size={14} /> Tous les secteurs
              </Button>
            </div>
          ) : null}
          {!results.length ? (
            <Panel>
              <EmptyState title="Aucune rubrique trouvée">
                Essayez un autre mot : le produit, la substance ou le procédé utilisé. Une activité absente de la nomenclature peut être non classée : vérifiez avec
                d’autres termes avant de conclure.
              </EmptyState>
            </Panel>
          ) : (
            <ul className={s.results}>
              {results.map((r) => (
                <li key={r.code}>
                  <button type="button" className={s.result} onClick={() => setCode(r.code)} aria-expanded={selected?.code === r.code}>
                    <span className={s.code}>{r.code}</span>
                    <span>
                      {r.title} {r.kind === "definition" ? <Badge outline>Définition</Badge> : null}
                    </span>
                  </button>
                  {r.kind === "activity" ? (
                    <Button size="sm" variant={count(r.code) ? "ghost" : "secondary"} aria-label={`Ajouter ${r.code} à l’établissement`} onClick={() => add(r.code)}>
                      {count(r.code) ? <Check size={14} /> : <Plus size={14} />}
                      {count(r.code) ? `Ajoutée${count(r.code) > 1 ? ` (${count(r.code)})` : ""}` : "Ajouter"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className={s.sectors}>
          {(
            [
              ["1", "Activités"],
              ["2", "Substances"],
            ] as const
          ).map(([prefix, label]) => (
            <section key={prefix} className={s.sectorGroup} aria-label={label}>
              <h3>{label}</h3>
              {Object.entries(SECTORS)
                .filter(([c]) => c.startsWith(prefix))
                .map(([c, [title, description]]) => (
                  <button type="button" key={c} className={s.sector} onClick={() => setSection(c)}>
                    <span className={s.code}>{c}</span>
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </div>
      )}
      <p className={s.note}>Nomenclature de 2005, consolidée avec les modifications de 2010 et 2012. Un outil d’aide à la décision : le texte officiel fait foi.</p>

      {selected ? (
        <RubriqueSheet key={selected.code} rub={selected} count={count(selected.code)} onAdd={() => add(selected.code)} onOpen={setCode} onClose={() => setCode(null)} />
      ) : null}
    </div>
  );
}

function RubriqueSheet({ rub, count, onAdd, onOpen, onClose }: { rub: Rubrique; count: number; onAdd: () => void; onOpen: (code: string) => void; onClose: () => void }) {
  const group = additionGroup(rub.code);
  const related =
    rub.kind === "definition"
      ? nomenclature.rubriques.filter((r) => r.code !== rub.code && r.code.startsWith(`${rub.code.split(" ")[0]} bis`)).map((r) => r.code)
      : [];
  return (
    <Sheet
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={`${rub.code} ${rub.title}`}
      description={rub.replaces ? `Modifiée par l’arrêté de ${rub.source}` : rub.source === "2005" ? "Arrêté de 2005" : `Ajoutée par l’arrêté de ${rub.source}`}
      footer={
        rub.kind === "activity" ? (
          <Button
            variant="primary"
            onClick={() => {
              onAdd();
              onClose(); // the toast says it, with a way to the dossier
            }}
          >
            <Plus size={15} /> {count ? "Ajouter encore à l'établissement" : "Ajouter à l'établissement"}
          </Button>
        ) : undefined
      }
    >
      {rub.text ? <p className={s.text}>{rub.text}</p> : null}
      {group ? (
        <Notice title={`Règle d’addition : groupe ${group}`}>
          Arrêté du 23 février 2010, art. 2 bis : si l’établissement détient plusieurs substances du groupe, Σ qx/Qx &gt; 1 le classe dans la catégorie supérieure.
        </Notice>
      ) : null}
      {rub.kind === "definition" ? (
        <Notice title="Cette rubrique définit une famille de substances">
          Ajoutez plutôt{" "}
          {related.map((c, i) => (
            <span key={c}>
              {i ? ", " : ""}
              <button type="button" className={s.link} onClick={() => onOpen(c)}>
                {c}
              </button>
            </span>
          ))}
          .
        </Notice>
      ) : null}
      {rub.items.length ? (
        <SheetSection title="Cas et seuils">
          <div className={`${table.wrap} ${s.tableWrap}`}>
            <table className={table.table}>
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
                      {it.path.length ? <span className={table.secondary}>{it.path.join(" › ")}</span> : null}
                      {it.criterion || rub.title}
                    </td>
                    <td>
                      {describe(it.condition)}
                      {it.condition?.unit_inferred ? (
                        <>
                          {" "}
                          <Badge outline title="Unité déduite des autres lignes">
                            déduite
                          </Badge>
                        </>
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
          {rub.items[0] ? <p className={s.note}>Source : {sourceOf(rub.items[0])}</p> : null}
        </SheetSection>
      ) : null}
    </Sheet>
  );
}
