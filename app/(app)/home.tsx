"use client";
/**
 * The home: where each establishment stands, what waits (evaluations late or due, texts of the
 * JORT), the latest texts of the Journal, and the ways in for a new client.
 */
import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { OffreBanner, useCloud } from "@/app/components/cloud";
import { Badge, ButtonLink, EmptyState, PageHeader, Panel, Progress, Stats, table } from "@/app/ui";
import { canWrite } from "@/lib/cloud/api";
import { aJour, etatRegistre } from "@/lib/registre/etat";
import { classLabel, dateCourte } from "@/lib/registre/labels";
import { metierLabels } from "@/lib/registre/profil";
import { lastIssue } from "@/lib/veille/served";
import { useRegistreList } from "./_data/registres";
import { useCatalogue } from "./_data/veille";
import s from "./home.module.css";

/** Links sent before the screens had their own address (e-mails: ?vue=registres, ?e=… for a classification). */
const OLD_VIEWS: Record<string, string> = {
  registres: "/registres",
  veille: "/veille",
  equipe: "/equipe",
  compte: "/compte",
  admin: "/admin",
  search: "/classement",
  establishment: "/classement?vue=etablissement",
};

const href = (id: string) => `/registres/${encodeURIComponent(id)}`;

export function Home() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const vue = params.get("vue");
    if (vue && OLD_VIEWS[vue]) router.replace(OLD_VIEWS[vue]);
    else if (params.get("e") || params.get("code") || params.get("q")) router.replace(`/classement?${params.toString()}`);
  }, [params, router]);

  const cloud = useCloud();
  const registres = useRegistreList();
  const { ready, meta, texts, amendments } = useCatalogue();
  const etats = useMemo(() => (registres ?? []).map((reg) => ({ reg, ...etatRegistre(reg, amendments, texts) })), [registres, amendments, texts]);
  const total = (k: "retard" | "aFaire" | "nonConformes" | "jort" | "nouveaux") => etats.reduce((n, e) => n + e[k], 0);
  const writable = !cloud.current || canWrite(cloud.current);

  const last = lastIssue(meta.scanned);
  const lastDate = last ? meta.recent.find((h) => h.year === last.year && h.issue === last.number)?.date : null;
  const latest = useMemo(() => meta.recent.filter((h) => h.severity !== "information").slice(0, 5), [meta]);

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const actions = (
    <>
      <ButtonLink href="/classement">
        <Search size={15} /> Classer un établissement
      </ButtonLink>
      {writable ? (
        <ButtonLink href="/registres/nouveau" variant="primary">
          <Plus size={15} /> Nouveau registre
        </ButtonLink>
      ) : null}
    </>
  );

  return (
    <div className={s.grid}>
      <PageHeader
        title="Accueil"
        description={cloud.current ? `${cloud.current.name} · ${today}` : `Mode local : les registres restent dans ce navigateur · ${today}`}
        actions={registres?.length ? actions : undefined}
      />
      <OffreBanner />

      {registres && !registres.length ? (
        <Panel>
          <EmptyState
            icon={<Building2 size={20} />}
            title="Commencez par un établissement"
            actions={actions}
          >
            Classez un site selon la nomenclature pour obtenir sa catégorie, son étude ANPE et les textes qui s’y appliquent, ou ouvrez directement le
            registre d’une entreprise que la nomenclature ne classe pas (BTP, industrie, services).
          </EmptyState>
        </Panel>
      ) : null}

      {etats.length ? (
        <>
          <Stats
            items={[
              { label: etats.length > 1 ? "Établissements" : "Établissement", value: etats.length, onClick: () => router.push("/registres") },
              { label: "Évaluations en retard", value: total("retard"), tone: total("retard") ? "danger" : undefined, onClick: () => router.push("/registres") },
              { label: "À évaluer", value: total("aFaire"), tone: total("aFaire") ? "warning" : undefined, onClick: () => router.push("/registres") },
              { label: "Du JORT à examiner", value: total("jort") + total("nouveaux"), tone: total("jort") + total("nouveaux") ? "warning" : undefined, onClick: () => router.push("/registres") },
            ]}
          />
          <Panel title="Établissements" actions={<Link href="/registres">Tous les registres</Link>} padded={false}>
            <table className={`${table.table} ${table.stack}`}>
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th>Évaluation</th>
                  <th className={table.num}>Conformité</th>
                  <th className={table.num}>Textes</th>
                  <th className={table.num}>À traiter</th>
                </tr>
              </thead>
              <tbody>
                {etats.map((e) => {
                  const metiers = metierLabels(e.reg.site);
                  return (
                    <tr key={e.reg.id} data-href onClick={() => router.push(href(e.reg.id))}>
                      <td data-slot="main" className={s.etab}>
                        <Link href={href(e.reg.id)} className={table.primary} onClick={(ev) => ev.stopPropagation()}>
                          {e.reg.nom || "Sans nom"}
                        </Link>
                        <span className={table.secondary}>
                          {classLabel(e.reg.classe, e.reg.activites.length)}
                          {metiers.length ? ` · ${metiers.slice(0, 2).join(", ")}${metiers.length > 2 ? "…" : ""}` : ""}
                        </span>
                      </td>
                      <td data-slot="meta">
                        <span className={s.progressCell}>
                          <Progress value={e.progress} label={`${e.progress} % évalué`} />
                          <span className="tabular">{e.progress} %</span>
                        </span>
                      </td>
                      <td data-slot="hide" className={table.num}>
                        {e.taux === null ? <span className={table.muted}>—</span> : `${e.taux} %`}
                      </td>
                      <td data-slot="hide" className={table.num}>
                        {e.retenus}
                      </td>
                      <td data-slot="side">
                        <span className={s.badges}>
                          {e.retard ? <Badge tone="danger">{e.retard} en retard</Badge> : null}
                          {e.nonConformes ? <Badge tone="danger">{e.nonConformes} NC</Badge> : null}
                          {e.aFaire ? <Badge tone="warning">{e.aFaire} à évaluer</Badge> : null}
                          {e.jort + e.nouveaux ? <Badge tone="accent">{e.jort + e.nouveaux} JORT</Badge> : null}
                          {aJour(e) ? (
                            <Badge tone="success" dot>
                              À jour
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      ) : null}

      <Panel title="Journal officiel" actions={<Link href="/veille">Toute la veille</Link>} padded={false}>
        {!ready ? (
          <p className={s.muted}>Chargement de la veille…</p>
        ) : latest.length ? (
          <ul className={s.hits}>
            {latest.map((h) => (
              <li key={h.id} className={s.hit}>
                <span className={s.hitHead}>
                  <Badge tone={h.severity === "critique" ? "danger" : "warning"}>{h.severity === "critique" ? "Critique" : "Important"}</Badge>
                  JORT n° {h.issue}/{h.year}
                  {h.date ? ` · ${dateCourte(h.date)}` : ""}
                </span>
                <a href={h.pdf} target="_blank" rel="noreferrer" className={`${s.hitTitle} ${table.clamp}`} dir="auto">
                  {h.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.muted}>Aucun texte important relevé pour l’instant.</p>
        )}
        {last ? (
          <p className={s.foot}>
            Lu jusqu’au n° {last.number}/{last.year}
            {lastDate ? `, paru le ${dateCourte(lastDate)}` : ""}.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
