"use client";
/**
 * One register: where it stands, what waits (texts modified at the JORT, new texts, texts that no
 * longer apply), and its texts as a table, grouped by domain, to evaluate one by one in a sheet.
 * Keyboard: / searches, j and k move between texts, Entrée opens one.
 */
import { ChevronLeft, ChevronRight, Download, FileText, MoreHorizontal, Paperclip, Plus, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { downloadWorkbook, today } from "@/app/components/download";
import { RapportConformite } from "@/app/components/rapport-conformite";
import { useRemoteNotice } from "../../_data/registres";
import { fetchFiches, useFiche } from "../../_data/veille";
import { Badge, Button, Kbd, Menu, MenuItem, Notice, PageHeader, SearchInput, Select, Sheet, SheetSection, Stats, table, Tabs, TextField } from "@/app/ui";
import { canWrite, uploadPreuve } from "@/lib/cloud/api";
import { etatRegistre } from "@/lib/registre/etat";
import { importance } from "@/lib/registre/importance";
import { classLabel, dateCourte, initials, refOf } from "@/lib/registre/labels";
import { metierLabels } from "@/lib/registre/profil";
import { remplacePar, type Texte } from "@/lib/registre/referentiel";
import {
  abrogePar,
  addTexte,
  alertes,
  historique,
  type Ligne,
  nouveautes,
  plusApplicables,
  preuvesDe,
  prochaine,
  type Registre,
  setLigne as withLigne,
  suggestions,
  texteFromAmendment,
} from "@/lib/registre/registre";
import { study } from "@/lib/studies";
import { defaults } from "@/lib/veille/fiche";
import { fillHistorique, fillRegister, historiqueRows, ligneRow } from "@/lib/veille/registre";
import { type Amendment, fold, rules } from "@/lib/veille/watch";
import { Attention, AttentionItem } from "./Attention";
import { ConformiteBadge } from "./badges";
import { LigneSheet } from "./LigneSheet";
import { ProfilForm } from "./ProfilForm";
import s from "./RegistreDetail.module.css";

const ESSENTIELS = 30;
type Filtre = "tous" | "afaire" | "nc" | "conformes" | "essentiels" | "suggestions";
const FILTRES: [Filtre, string][] = [
  ["tous", "Tous"],
  ["afaire", "À faire"],
  ["nc", "Non conformes"],
  ["conformes", "Conformes"],
  ["essentiels", "Essentiels"],
  ["suggestions", "Suggestions"],
];
const VIDE: Record<Filtre, string> = {
  tous: "Aucun texte ici.",
  afaire: "Rien à faire : toutes les évaluations sont à jour.",
  nc: "Aucune non-conformité.",
  conformes: "Aucun texte évalué conforme pour l’instant.",
  essentiels: "Aucun texte ici.",
  suggestions: "Aucune suggestion : tous les textes proposés sont retenus.",
};


/** Where a text's follow-up stands, in a few words: the action of a non-conformity, or the next evaluation. */
function Suivi({ l }: { l: Ligne }) {
  if (!l.retenu) return <span className={s.next}>Non retenu</span>;
  if (l.conformite === "NC")
    return (
      <span className={`${s.next} ${l.echeance && l.echeance < today() && !l.actionFaite ? s.late : ""}`}>
        {l.actionFaite ? "Action réalisée" : l.echeance ? `Échéance ${dateCourte(l.echeance)}` : "Action à planifier"}
      </span>
    );
  const next = prochaine(l);
  if (next.etat === "a-evaluer") return <span className={s.next}>Jamais évalué</span>;
  return (
    <span className={`${s.next} ${next.etat === "en-retard" ? s.late : ""}`}>
      {next.etat === "en-retard" ? "En retard · " : "Le "}
      {dateCourte(next.date!)}
    </span>
  );
}

export function RegistreDetail({
  reg,
  change,
  texts,
  amendments,
  saved,
}: {
  reg: Registre;
  change: (fn: (r: Registre) => Registre) => void;
  texts: Texte[];
  amendments: Amendment[];
  saved: boolean;
}) {
  const cloud = useCloud();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [domaine, setDomaine] = useState("all");
  const [query, setQuery] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [reglages, setReglages] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [adding, setAdding] = useState("");
  const [exporting, setExporting] = useState(false);
  const [rapport, setRapport] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const editable = !cloud.current || canWrite(cloud.current);
  const who = cloud.name || cloud.user?.email || "";

  // The text open in the sheet is in the address (?texte=…): a link leads to it.
  const openId = params.get("texte");
  const fiche = useFiche(openId);
  const openText = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?texte=${encodeURIComponent(id)}` : pathname, { scroll: false }),
    [router, pathname],
  );

  // A colleague's changes reached this register, or ours were merged with theirs: said briefly.
  const remote = useRemoteNotice(reg.id);

  const etat = useMemo(() => etatRegistre(reg, amendments, texts), [reg, amendments, texts]);
  const retenus = reg.lignes.filter((l) => l.retenu);
  // Suggestions are not kept in the register until acted on (lib/registre/registre.ts suggestions()).
  const suggested = useMemo(() => suggestions(reg, texts), [reg, texts]);
  const lignes = useMemo(() => [...reg.lignes, ...suggested], [reg.lignes, suggested]);
  const alerts = alertes(reg, amendments);
  const pending = new Set(alerts.map((a) => `${a.ligne.texte.id}|${a.amendment.id}`));
  const historyOf = (l: Ligne) =>
    historique(l, amendments)
      .filter((a) => !pending.has(`${l.texte.id}|${a.id}`))
      .reverse();
  const gone = plusApplicables(reg);
  const rank = useMemo(() => {
    const byId = new Map(texts.map((t) => [t.id, t]));
    return new Map(lignes.map((l) => [l.texte.id, importance(byId.get(l.texte.id) ?? l.texte, reg.site)]));
  }, [texts, lignes, reg.site]);
  const score = (l: Ligne) => rank.get(l.texte.id)?.score ?? 0;
  const byScore = (a: Ligne, b: Ligne) => score(b) - score(a);
  const news = useMemo(() => nouveautes(reg, texts).sort((a, b) => importance(b.texte, reg.site).score - importance(a.texte, reg.site).score), [reg, texts]);
  const domains = Object.keys(rules.domains).filter((d) => lignes.some((l) => l.texte.domaine === d));
  const essentielIds = useMemo(
    () => new Set([...retenus].sort(byScore).slice(0, ESSENTIELS).map((l) => l.texte.id)),
    [reg.lignes, rank], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const setLigne = (l: Ligne, patch: Partial<Ligne>) => change((r) => withLigne(r, l, (x) => ({ ...x, ...patch })));
  const counts: Record<Filtre, number> = {
    tous: retenus.length,
    afaire: etat.retard + etat.aFaire,
    nc: etat.nonConformes,
    conformes: etat.conformes,
    essentiels: Math.min(ESSENTIELS, retenus.length),
    suggestions: lignes.length - retenus.length,
  };

  const q = fold(query);
  const shown = lignes.filter((l) => {
    if (filtre === "suggestions" ? l.retenu : !l.retenu) return false;
    if (filtre === "nc" && l.conformite !== "NC") return false;
    if (filtre === "conformes" && l.conformite !== "C") return false;
    if (filtre === "afaire" && prochaine(l).etat === "a-jour") return false;
    if (filtre === "essentiels" && !essentielIds.has(l.texte.id)) return false;
    if (domaine !== "all" && l.texte.domaine !== domaine) return false;
    return !q || fold(`${l.texte.titre} ${l.texte.theme} ${l.resume} ${l.texte.numero ?? ""}`).includes(q);
  });
  const flat = filtre !== "tous" || !!q || domaine !== "all";
  const groups = Object.keys(rules.domains)
    .map((d) => [d, shown.filter((l) => l.texte.domaine === d).sort(byScore)] as const)
    .concat([["autres", shown.filter((l) => !(l.texte.domaine in rules.domains)).sort(byScore)] as const])
    .filter(([, lignes]) => lignes.length);
  const isOpen = (d: string) => groups.length === 1 || ouverts.has(d);
  const toggle = (d: string) => setOuverts((o) => (o.has(d) ? new Set([...o].filter((x) => x !== d)) : new Set([...o, d])));

  const candidates = useMemo(() => {
    const t = fold(adding);
    if (t.length < 3) return [];
    const inRegister = new Set(reg.lignes.filter((l) => l.retenu).map((l) => l.texte.id));
    return texts.filter((x) => !inRegister.has(x.id) && fold(`${x.titre} ${x.theme} ${x.numero ?? ""}`).includes(t)).slice(0, 12);
  }, [adding, texts, reg.lignes]);

  // Keyboard: / to search, j / k between the rows, Entrée to open (on the row).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || openId || rapport || reglages || ajout) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      const rows = [...(tableRef.current?.querySelectorAll<HTMLElement>("tr[data-ligne]") ?? [])];
      if (!rows.length) return;
      e.preventDefault();
      const i = rows.findIndex((r) => r === el);
      const next = e.key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      rows[next]!.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, rapport, reglages, ajout]);

  const exportAll = async () => {
    setExporting(true);
    try {
      // The texts' requirements, written résumés and plans, from the server.
      const fiches = await fetchFiches(retenus.map((l) => l.texte.id));
      const ficheOf = (l: Ligne) => defaults(l.texte.domaine, fiches[l.texte.id]);
      await downloadWorkbook(
        (wb) => {
          fillRegister(
            wb,
            [...retenus]
              .sort(byScore)
              .map((l) => ligneRow(l, ficheOf(l), { abroge: abrogePar(l, amendments), remplacePar: remplacePar(l.texte), modifie: historique(l, amendments) })),
            new Date(),
            reg.nom,
          );
          fillHistorique(wb, retenus.flatMap(historiqueRows));
        },
        `ID-QSE-002_${reg.nom.replace(/[^\p{L}\p{N}]+/gu, "_")}_${today()}.xlsx`,
      );
    } finally {
      setExporting(false);
    }
  };

  const row = (l: Ligne) => {
    const n = preuvesDe(l).length;
    return (
      <tr
        key={l.texte.id}
        data-ligne={l.texte.id}
        className={`${s.row} ${l.retenu ? "" : s.left}`}
        tabIndex={0}
        onClick={() => openText(l.texte.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) openText(l.texte.id);
        }}
        data-href=""
      >
        <td data-slot="main" className={s.title}>
          <span className={`${table.primary} ${table.clamp}`} dir="auto">
            {l.texte.titre}
          </span>
          <span className={table.secondary}>
            {refOf(l.texte) || l.texte.type} · {l.texte.theme}
          </span>
        </td>
        <td data-slot="side">
          <ConformiteBadge c={l.conformite} />
        </td>
        <td data-slot="meta">
          <Suivi l={l} />
          {n ? (
            <span className={s.clip}>
              {" · "}
              <Paperclip size={12} aria-hidden="true" />
              {n} preuve{n > 1 ? "s" : ""}
            </span>
          ) : null}
        </td>
        <td data-slot="hide">{l.responsable ? <span className={s.who} title={l.responsable}>{initials(l.responsable)}</span> : null}</td>
      </tr>
    );
  };

  const metiers = metierLabels(reg.site);
  const open = openId ? lignes.find((l) => l.texte.id === openId) : undefined;

  return (
    <div className={s.screen}>
      <Link href="/registres" className={s.back}>
        <ChevronLeft size={15} /> Registres
      </Link>
      <PageHeader
        title={reg.nom || "Sans nom"}
        description={[
          classLabel(reg.classe, reg.activites.length),
          reg.etude ? study(reg.etude, false).title : "",
          reg.activites.length ? `rubriques ${reg.activites.map((a) => a.code).join(", ")}` : "",
          metiers.join(", "),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button onClick={() => setRapport(true)}>
              <FileText size={15} /> Rapport PDF
            </Button>
            <Menu
              align="end"
              trigger={
                <Button icon aria-label="Plus d’actions">
                  <MoreHorizontal size={16} />
                </Button>
              }
            >
              <MenuItem icon={<Download size={15} />} onSelect={() => void exportAll()}>
                {exporting ? "Préparation du fichier…" : "Exporter le registre (Excel)"}
              </MenuItem>
              {editable ? (
                <MenuItem icon={<Plus size={15} />} onSelect={() => setAjout(true)}>
                  Ajouter un texte
                </MenuItem>
              ) : null}
              <MenuItem icon={<Settings2 size={15} />} onSelect={() => setReglages(true)}>
                Nom et profil du site
              </MenuItem>
              {reg.restauration ? <MenuItem onSelect={() => router.push(reg.restauration!)}>Revoir le classement</MenuItem> : null}
            </Menu>
          </>
        }
      />
      {!saved ? (
        <Notice tone="danger" title="Non enregistré dans ce navigateur">
          Sauvegardez les registres dans un fichier (Registres, menu ⋯).
        </Notice>
      ) : null}

      <Stats
        items={[
          { label: `Évalué, sur ${etat.retenus} textes`, value: `${etat.progress} %` },
          { label: "Conformes", value: etat.conformes, tone: etat.conformes ? "success" : undefined, onClick: () => setFiltre("conformes") },
          { label: "Non conformes", value: etat.nonConformes, tone: etat.nonConformes ? "danger" : undefined, onClick: () => setFiltre("nc") },
          { label: etat.retard ? `À faire, dont ${etat.retard} en retard` : "À faire", value: etat.retard + etat.aFaire, tone: etat.retard ? "danger" : etat.aFaire ? "warning" : undefined, onClick: () => setFiltre("afaire") },
        ]}
      />

      {alerts.length ? (
        <Attention title={`Textes du registre modifiés au JORT (${alerts.length})`}>
          {alerts.map(({ ligne, amendment }) => (
            <AttentionItem
              key={`${ligne.texte.id}-${amendment.id}`}
              meta={`JORT n° ${amendment.issue}/${amendment.year}, p. ${amendment.page}`}
              actions={
                editable ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        change((r) => {
                          const seen = withLigne(r, ligne, (x) => ({ ...x, vus: [...x.vus, amendment.id], evalue: "", conformite: "" }));
                          return addTexte(seen, texteFromAmendment(amendment, ligne.texte, texts));
                        })
                      }
                    >
                      Ajouter ce texte et réévaluer
                    </Button>
                    <Button size="sm" onClick={() => setLigne(ligne, { vus: [...ligne.vus, amendment.id], evalue: "", conformite: "" })}>
                      Réévaluer seulement
                    </Button>
                  </>
                ) : undefined
              }
            >
              <strong>{refOf(ligne.texte)}</strong> est visé par{" "}
              <a href={amendment.pdf} target="_blank" rel="noreferrer" dir="auto">
                {amendment.title}
              </a>
            </AttentionItem>
          ))}
        </Attention>
      ) : null}

      {news.length ? (
        <Attention
          title={`Nouveaux textes pour ce site (${news.length})`}
          note="Parus au JORT depuis la création du registre, ou devenus applicables avec le profil ou le classement du site."
          action={
            editable ? (
              <Button size="sm" onClick={() => change((r) => news.reduce((acc, n) => addTexte(acc, n.texte), r))}>
                Tout ajouter
              </Button>
            ) : undefined
          }
        >
          {news.map(({ texte, reasons }) => (
            <AttentionItem
              key={texte.id}
              meta={`${texte.theme} · ${reasons.join(", ")}`}
              actions={
                editable ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => change((r) => addTexte(r, texte))}>
                      Ajouter
                    </Button>
                    <Button size="sm" onClick={() => change((r) => ({ ...r, ecartes: [...r.ecartes, texte.id] }))}>
                      Écarter
                    </Button>
                  </>
                ) : undefined
              }
            >
              {texte.source ? (
                <a href={texte.source} target="_blank" rel="noreferrer" dir="auto">
                  {texte.titre}
                </a>
              ) : (
                <span dir="auto">{texte.titre}</span>
              )}
            </AttentionItem>
          ))}
        </Attention>
      ) : null}

      {gone.length ? (
        <Attention
          title={`Textes qui ne s’appliquent plus au site (${gone.length})`}
          note="Le profil ou le classement a changé : ces textes ne répondent plus à leurs conditions. Retirez-les, ou gardez-les si le site y reste soumis."
        >
          {gone.map((l) => (
            <AttentionItem
              key={l.texte.id}
              meta={`${l.texte.theme} · proposé pour : ${l.raisons.join(", ")}`}
              actions={
                editable ? (
                  <>
                    <Button size="sm" onClick={() => setLigne(l, { retenu: false })}>
                      Retirer
                    </Button>
                    <Button size="sm" onClick={() => setLigne(l, { garde: true })}>
                      Garder
                    </Button>
                  </>
                ) : undefined
              }
            >
              <span dir="auto">{l.texte.titre}</span>
            </AttentionItem>
          ))}
        </Attention>
      ) : null}

      <div className={s.tabsScroll}>
        <Tabs<Filtre> label="Afficher" value={filtre} onChange={setFiltre} tabs={FILTRES.map(([value, label]) => ({ value, label, count: counts[value] }))} />
      </div>
      <div className={s.toolbar}>
        <SearchInput ref={searchRef} label="Rechercher dans le registre" className={s.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un texte, une exigence…" />
        <Select aria-label="Domaine" className={s.domain} value={domaine} onChange={(e) => setDomaine(e.target.value)}>
          <option value="all">Tous les domaines</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {rules.domains[d]}
            </option>
          ))}
        </Select>
      </div>
      <p className={s.count} aria-live="polite">
        {shown.length} texte{shown.length > 1 ? "s" : ""}
        {filtre === "essentiels" ? " : ceux qui comptent le plus pour ce site (nature du texte, textes qui s’y réfèrent, activité, date)" : ""}
        {shown.length ? (
          <>
            {" · "}
            <Kbd>j</Kbd> <Kbd>k</Kbd> pour se déplacer, <Kbd>/</Kbd> pour chercher
          </>
        ) : null}
      </p>

      {!shown.length ? (
        <Notice title={VIDE[filtre]} />
      ) : (
        <div className={table.wrap}>
          <table ref={tableRef} className={`${table.table} ${table.stack} ${s.fixed}`}>
            <colgroup>
              <col />
              <col className={s.colConf} />
              <col className={s.colSuivi} />
              <col className={s.colWho} />
            </colgroup>
            <thead>
              <tr>
                <th>Texte</th>
                <th>Conformité</th>
                <th>Suivi</th>
                <th>
                  <span className="visually-hidden">Responsable</span>
                  <Users size={13} aria-hidden="true" />
                </th>
              </tr>
            </thead>
            {flat ? (
              <tbody>{[...shown].sort(byScore).map(row)}</tbody>
            ) : (
              groups.map(([d, lignes]) => {
                const nc = lignes.filter((l) => l.conformite === "NC").length;
                const todo = lignes.filter((l) => prochaine(l).etat !== "a-jour").length;
                return (
                  <tbody key={d}>
                    <tr className={s.group}>
                      <th colSpan={4} scope="rowgroup">
                        <button type="button" className={s.groupToggle} aria-expanded={isOpen(d)} onClick={() => toggle(d)}>
                          <ChevronRight size={14} />
                          {rules.domains[d] ?? "Autres textes"}
                          <span className={s.groupCounts}>
                            <span>{lignes.length}</span>
                            {nc ? <Badge tone="danger">{nc} NC</Badge> : null}
                            {todo ? <Badge tone="warning">{todo} à faire</Badge> : null}
                          </span>
                        </button>
                      </th>
                    </tr>
                    {isOpen(d) ? lignes.map(row) : null}
                  </tbody>
                );
              })
            )}
          </table>
        </div>
      )}

      {remote ? (
        <div className={s.toast}>
          <Notice title={remote} />
        </div>
      ) : null}

      {rapport ? (
        <RapportConformite
          reg={reg}
          amendments={amendments}
          texts={texts}
          espace={cloud.current?.name ?? null}
          auteur={cloud.name || cloud.user?.email || null}
          onClose={() => setRapport(false)}
        />
      ) : null}

      {open ? (
        <LigneSheet
          key={open.texte.id}
          l={open}
          fiche={fiche ?? undefined}
          raisons={rank.get(open.texte.id)?.raisons}
          history={historyOf(open)}
          repealed={abrogePar(open, amendments)}
          set={(patch) => setLigne(open, patch)}
          replace={(fn) => change((r) => withLigne(r, open, fn))}
          onClose={() => openText(null)}
          who={who}
          editable={editable}
          upload={cloud.current ? (file) => uploadPreuve(cloud.current!.id, reg.id, file) : null}
        />
      ) : null}

      <Sheet open={reglages} onOpenChange={setReglages} wide title="Nom et profil du site" description="Le profil choisit les textes proposés : une réponse changée propose les textes qui s’y rapportent.">
        <TextField label="Nom de l’établissement" value={reg.nom} onChange={(e) => change((r) => ({ ...r, nom: e.target.value }))} disabled={!editable} />
        <ProfilForm site={reg.site} onChange={(site) => change((r) => ({ ...r, site }))} disabled={!editable} />
      </Sheet>

      <Sheet open={ajout} onOpenChange={setAjout} title="Ajouter un texte" description="Un texte du référentiel ou du Journal officiel qui n’est pas dans le registre.">
        <SheetSection title="Rechercher">
          <SearchInput label="Texte à ajouter" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Au moins 3 lettres : bruit, 2000-147, chaudière…" autoFocus />
          {candidates.length ? (
            <ul className={s.candidates}>
              {candidates.map((t) => (
                <li key={t.id}>
                  <span>
                    <span dir="auto">{t.titre}</span>
                    <span className={s.meta}>
                      {t.theme}
                      {t.publie ? ` · ${t.publie}` : ""}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => change((r) => addTexte(r, t))}>
                    Ajouter
                  </Button>
                </li>
              ))}
            </ul>
          ) : adding.length >= 3 ? (
            <p className={s.hint}>Aucun texte trouvé hors du registre.</p>
          ) : null}
        </SheetSection>
      </Sheet>
    </div>
  );
}
