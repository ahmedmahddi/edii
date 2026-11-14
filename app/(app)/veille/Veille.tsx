"use client";
/**
 * The veille: the texts of the Journal officiel that concern the sites followed, newest first,
 * filtered and paged by the server (app/api/journal). A text opens in a sheet (its domains, sectors,
 * why it was found, the reading status kept in this browser, a report to ABC Consulting).
 */
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadWorkbook, today } from "@/app/components/download";
import { Signaler } from "@/app/components/signaler";
import { Badge, Button, Notice, PageHeader, SearchInput, Segmented, Select, Sheet, SheetSection, Stats, type Tone } from "@/app/ui";
import { dateCourte } from "@/lib/registre/labels";
import { SECTORS } from "@/lib/sectors";
import { type JournalPage, type JournalQuery, type Niveau, type Statut, STATUTS } from "@/lib/veille/journal";
import { fillRegister, registerRow } from "@/lib/veille/registre";
import { type Hit, type Impact, rules, type Severity } from "@/lib/veille/watch";
import { useLive, useVeilleMeta } from "../_data/veille";
import { useStatuts } from "./statuts";
import { Verifier } from "./Verifier";
import s from "./veille.module.css";

const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  critique: { label: "Critique", tone: "danger" },
  important: { label: "Important", tone: "warning" },
  information: { label: "Information", tone: "neutral" },
};
const IMPACTS: Record<Impact, string> = {
  nomenclature: "Nomenclature",
  addition: "Règle d’addition",
  etude: "Étude ANPE",
  procedures: "Procédures d’autorisation",
};

async function fetchJournal(body: JournalQuery & { live: unknown }): Promise<JournalPage> {
  const res = await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Journal : HTTP ${res.status}`);
  return (await res.json()) as JournalPage;
}

/** A filter typed in: asked for once the typing pauses. */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Veille() {
  const meta = useVeilleMeta();
  const live = useLive();
  const [statuts, setStatut] = useStatuts();
  const [query, setQuery] = useState("");
  const [niveau, setNiveau] = useState<Niveau>("tous");
  const [domaine, setDomaine] = useState("");
  const [secteur, setSecteur] = useState("");
  const [statut, setStatutFilter] = useState<Statut | "tous">("tous");
  const [open, setOpen] = useState<Hit | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(query);
  const filters: JournalQuery = { q, niveau, domaine, secteur, statut, statuts };

  const list = useInfiniteQuery({
    queryKey: ["journal", filters, live.length],
    queryFn: ({ pageParam }) => fetchJournal({ ...filters, page: pageParam, live }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const first = list.data?.pages[0];
  const hits = list.data?.pages.flatMap((p) => p.hits) ?? [];

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await fetchJournal({ ...filters, tout: true, live });
      await downloadWorkbook((wb) => fillRegister(wb, all.hits.map(registerRow), new Date()), `ID-QSE-002_veille_${today()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const years = meta ? Object.entries(meta.scanned).sort(([a], [b]) => Number(b) - Number(a)) : [];
  return (
    <div className={s.screen}>
      <PageHeader
        title="Veille réglementaire"
        description="Les textes du Journal officiel qui concernent vos établissements."
        actions={
          <Button onClick={exportAll} disabled={!first?.total || exporting}>
            <Download size={15} /> {exporting ? "Préparation…" : "Exporter (Excel)"}
          </Button>
        }
      />
      <Verifier meta={meta} />
      {first ? (
        <Stats
          items={[
            { label: "Critiques", value: first.counts.critique, tone: first.counts.critique ? "danger" : undefined, onClick: () => setNiveau("critique") },
            { label: "Importants", value: first.counts.important, onClick: () => setNiveau("important") },
            { label: "À lire", value: first.counts.aLire, onClick: () => setStatutFilter("a-lire") },
            { label: "Textes repérés", value: first.counts.critique + first.counts.important + first.counts.information, onClick: () => setNiveau("tous") },
          ]}
        />
      ) : null}

      <div className={s.filters} role="group" aria-label="Filtrer la veille">
        <SearchInput label="Rechercher dans la veille" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titre, ministère…" />
        <Select aria-label="Domaine" value={domaine} onChange={(e) => setDomaine(e.target.value)}>
          <option value="">Tous les domaines</option>
          {(first?.domaines ?? [])
            .filter((d) => rules.domains[d])
            .map((d) => (
              <option key={d} value={d}>
                {rules.domains[d]}
              </option>
            ))}
        </Select>
        <Select aria-label="Secteur" value={secteur} onChange={(e) => setSecteur(e.target.value)}>
          <option value="">Tous les secteurs</option>
          {(first?.secteurs ?? []).map((c) => (
            <option key={c} value={c}>
              {c} · {SECTORS[c]?.[0] ?? c}
            </option>
          ))}
        </Select>
        <Select aria-label="Niveau" value={niveau} onChange={(e) => setNiveau(e.target.value as Niveau)}>
          <option value="tous">Tous les niveaux</option>
          <option value="important">Critiques et importants</option>
          <option value="critique">Critiques seulement</option>
        </Select>
        <Select aria-label="Statut" value={statut} onChange={(e) => setStatutFilter(e.target.value as Statut | "tous")}>
          <option value="tous">Tous les statuts</option>
          {(Object.keys(STATUTS) as Statut[]).map((k) => (
            <option key={k} value={k}>
              {STATUTS[k]}
            </option>
          ))}
        </Select>
      </div>

      {list.isError ? <Notice tone="danger" title="La veille n’a pas pu être lue.">Vérifiez la connexion, puis rechargez la page.</Notice> : null}
      {first ? (
        <>
          <div className={s.bar} aria-live="polite">
            <span>
              {first.total} texte{first.total > 1 ? "s" : ""}
              {list.isFetching && !list.isFetchingNextPage ? " · mise à jour…" : ""}
            </span>
          </div>
          {!hits.length ? (
            <Notice title="Aucun texte ne répond à ces filtres." />
          ) : (
            <ol className={s.list}>
              {hits.map((h) => {
                const st = statuts[h.id] ?? "a-lire";
                return (
                  <li key={h.id} className={st !== "a-lire" ? s.seen : undefined}>
                    <button type="button" className={s.hit} onClick={() => setOpen(h)}>
                      <span className={s.hitHead}>
                        <Badge tone={SEVERITY[h.severity].tone} dot>
                          {SEVERITY[h.severity].label}
                        </Badge>
                        <span>
                          JORT n° {h.issue}/{h.year}
                          {h.date ? ` · ${dateCourte(h.date)}` : ""} · p. {h.page}
                        </span>
                        {st !== "a-lire" ? <Badge outline>{STATUTS[st]}</Badge> : null}
                      </span>
                      <span className={s.hitTitle} dir="auto">
                        {h.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {list.hasNextPage ? (
            <div className={s.more}>
              <Button onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Chargement…" : `Afficher plus (${first.total - hits.length} restants)`}
              </Button>
            </div>
          ) : null}
        </>
      ) : !list.isError ? (
        <p className={s.muted} role="status">
          Chargement de la veille…
        </p>
      ) : null}

      <details className={s.method}>
        <summary>Comment la veille fonctionne</summary>
        <p>
          Chaque numéro du JORT (version française) est lu par son sommaire. Un texte est repéré quand son titre, sans l’autorité qui le signe, traite d’un des
          domaines suivis :
        </p>
        <dl>
          {Object.entries(rules.domains).map(([id, label]) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>
                {rules.rules
                  .filter((r) => r.domain === id)
                  .map((r) => r.label)
                  .join(" · ")}
              </dd>
            </div>
          ))}
        </dl>
        <ul>
          <li>
            <strong>Critique</strong> : le titre cite un texte de référence de l’application (la nomenclature du 15 novembre 2005, ses modifications de 2010 et
            2012, les décrets n° 2005-1991, n° 2006-2687 et n° 68-88). <strong>Important</strong> : une obligation pour les entreprises. <strong>Information</strong> :
            l’actualité d’un secteur, un accord international, un acte ponctuel.
          </li>
          <li>
            Sont ignorés : nominations, concours et carrière des agents publics, budget et comptes de l’État, prêts et garanties de l’État, permis miniers et
            pétroliers, expropriations, fixations de prix, prix et médailles.
          </li>
          <li>
            Un repérage est une alerte à lire, pas une conclusion juridique : le texte officiel fait foi. Les statuts « Pertinent » et « Sans objet » restent dans
            ce navigateur.
          </li>
          <li>
            « Exporter » enregistre les textes affichés comme lignes du registre de veille ID-QSE-002 ; le résumé de l’exigence, la conformité, le risque et le plan
            d’action restent à remplir. Filtrez sur le statut « Pertinent » pour n’exporter que les textes retenus.
          </li>
          <li>
            Numéros lus :{" "}
            {years.length
              ? years
                  .slice(0, 4)
                  .map(([y, n]) => `${y} : ${n.length}`)
                  .join(" · ") + (years.length > 4 ? ` · et ${years.length - 4} années avant, depuis ${years.at(-1)![0]}` : "")
              : "aucun pour l’instant"}
            .
          </li>
        </ul>
      </details>

      {open ? <HitSheet h={open} statut={statuts[open.id] ?? "a-lire"} setStatut={(st) => setStatut(open.id, st)} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function HitSheet({ h, statut, setStatut, onClose }: { h: Hit; statut: Statut; setStatut: (s: Statut) => void; onClose: () => void }) {
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={h.title}
      description={`JORT n° ${h.issue}/${h.year}${h.date ? ` du ${dateCourte(h.date)}` : ""}, p. ${h.page}${h.institution ? ` · ${h.institution}` : ""}`}
      head={
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Badge tone={SEVERITY[h.severity].tone} dot>
            {SEVERITY[h.severity].label}
          </Badge>
          <Badge outline>{h.kind}</Badge>
        </span>
      }
      footer={
        <a href={h.pdf} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Lire au JORT, p. {h.page} <ExternalLink size={14} />
        </a>
      }
    >
      <SheetSection title="Statut de lecture">
        <Segmented<Statut> label="Statut de lecture" value={statut} onChange={setStatut} block options={(Object.keys(STATUTS) as Statut[]).map((k) => ({ value: k, label: STATUTS[k] }))} />
      </SheetSection>
      <SheetSection title="Ce qu’il concerne">
        <dl className={s.tags}>
          <div>
            <dt>Domaines</dt>
            <dd>
              {h.domains.map((d) => (
                <Badge key={d}>{rules.domains[d] ?? d}</Badge>
              ))}
            </dd>
          </div>
          {h.sectors.length ? (
            <div>
              <dt>Secteurs</dt>
              <dd>
                {h.sectors.map((c) => (
                  <Badge key={c}>
                    {c} · {SECTORS[c]?.[0] ?? c}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
          {h.impacts.length ? (
            <div>
              <dt>Dans l’application</dt>
              <dd>
                {h.impacts.map((i) => (
                  <Badge key={i} tone="accent">
                    {IMPACTS[i]}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </SheetSection>
      <SheetSection title="Pourquoi il a été repéré">
        <ul className={s.rules}>
          {h.matches.map((m) => (
            <li key={m.rule}>
              {m.label} ({m.terms.join(", ")})
            </li>
          ))}
        </ul>
      </SheetSection>
      <div>
        <Signaler texteId={`jort-${h.id}`} titre={h.title} />
      </div>
    </Sheet>
  );
}
