"use client";
/**
 * One classification kept: the nomenclature (search, rubriques, thresholds), the establishment's
 * dossier (name, activities, quantities, addition rule, ANPE study) and its validated synthesis,
 * which starts the establishment's register. Every change is saved as it is made; a
 * classification left empty is not kept.
 */
import { ArrowLeft, ArrowRight, Building2, Check, Copy, MoreHorizontal, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { ClassificationReportView } from "@/app/components/classification-report";
import { Button, EmptyState, Menu, MenuItem, MenuSeparator, Notice, PageHeader, Panel, Tabs, TextField } from "@/app/ui";
import { canWrite } from "@/lib/cloud/api";
import { type Classement, dupliquer, synthesePerimee, vide } from "@/lib/classement/classement";
import { classements } from "@/lib/classement/store";
import { type Activity, classifyEstablishment } from "@/lib/establishment";
import { setPendingSeed } from "@/lib/registre/seed";
import { categoryLabel, createClassificationReport } from "@/lib/report";
import type { Situation } from "@/lib/studies";
import { useClassements } from "../_data/classements";
import { useRegistreList } from "../_data/registres";
import s from "./classement.module.css";
import { Establishment, Study } from "./Dossier";
import { Nomenclature } from "./Nomenclature";
import { ClasseBadge } from "./shared";

type ClassView = "search" | "establishment" | "report";

// How many screens show each classification: an empty one is dropped when the last one leaves it
// (counted, because React mounts a screen twice in development).
const shown = new Map<string, number>();

export function ClassementEditor({ id }: { id: string }) {
  const list = useClassements();
  const c = list?.find((x) => x.id === id);
  useEffect(() => {
    shown.set(id, (shown.get(id) ?? 0) + 1);
    return () => {
      shown.set(id, (shown.get(id) ?? 1) - 1);
      setTimeout(() => {
        if (shown.get(id)) return;
        const cur = classements.get().find((x) => x.id === id);
        if (cur && vide(cur)) classements.remove(id);
      }, 0);
    };
  }, [id]);
  if (!list) return null;
  if (!c)
    return (
      <Panel>
        <EmptyState title="Classement introuvable" actions={<ButtonBack />}>
          Ce classement n’existe pas, ou il a été supprimé.
        </EmptyState>
      </Panel>
    );
  return <Editor key={c.id} c={c} />;
}

const ButtonBack = () => {
  const router = useRouter();
  return <Button onClick={() => router.push("/classement")}>Tous les classements</Button>;
};

function Editor({ c }: { c: Classement }) {
  const router = useRouter();
  const params = useSearchParams();
  const cloud = useCloud();
  const regs = useRegistreList();
  const writable = !cloud.current || canWrite(cloud.current);
  const change = (fn: (c: Classement) => Classement) => {
    if (writable) classements.change(c.id, fn);
  };
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [view, setView] = useState<ClassView>(() =>
    params.get("vue") === "synthese" && c.synthese ? "report" : c.activites.length || params.get("vue") === "etablissement" ? "establishment" : "search",
  );
  const [notice, setNotice] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const validationRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activities = c.activites;
  const report = c.synthese;
  const reportStale = synthesePerimee(c);
  const est = useMemo(() => classifyEstablishment(activities), [activities]);
  const registre = c.registre ? regs?.find((r) => r.id === c.registre) : undefined;

  useEffect(() => setValidationErrors([]), [activities, c.situation, c.sensible]);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const go = (v: ClassView) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const setActivities = (fn: (list: Activity[]) => Activity[]) => change((x) => ({ ...x, activites: fn(x.activites) }));
  const validate = () => {
    const result = createClassificationReport(activities, c.situation, c.sensible, c.nom);
    if (!result.ok) {
      setValidationErrors(result.issues);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setValidationErrors([]);
    change((x) => ({ ...x, synthese: result.report }));
    go("report");
  };
  // The validated classification starts the establishment's register (/registres/nouveau).
  const startRegister = () => {
    if (!report) return;
    setPendingSeed(report, c.id);
    router.push("/registres/nouveau");
  };
  const open = (rub: string) => {
    setCode(rub);
    setView("search");
  };
  const add = (rub: string) => {
    setActivities((list) => [...list, { code: rub }]);
    setNotice(`Rubrique ${rub} ajoutée à l’établissement`);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  };
  const update = (i: number, patch: Partial<Activity>) => setActivities((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => setActivities((list) => list.filter((_, j) => j !== i));
  const count = (rub: string) => activities.filter((a) => a.code === rub).length;
  const toSearch = () => {
    go("search");
    requestAnimationFrame(() => document.getElementById("activity-search")?.focus());
  };
  const deleteIt = () => {
    if (!confirm(`Supprimer le classement « ${c.nom || "sans nom"} » ? Le registre qu’il a créé, s’il y en a un, est gardé.`)) return;
    classements.remove(c.id);
    router.push("/classement");
  };
  const copyIt = () => {
    const d = dupliquer(c);
    classements.update((all) => [d, ...all]);
    router.push(`/classement/${d.id}`);
  };

  const registerAction = registre ? (
    <Button size="sm" onClick={() => router.push(`/registres/${encodeURIComponent(registre.id)}`)}>
      Ouvrir le registre
    </Button>
  ) : (
    <Button size="sm" variant="primary" disabled={reportStale || !writable} onClick={startRegister}>
      Créer le registre
    </Button>
  );

  return (
    <div className={s.screen}>
      <Link href="/classement" className={s.back}>
        <ArrowLeft size={14} /> Classements
      </Link>
      <PageHeader
        title={c.nom || "Établissement sans nom"}
        description={
          est.classe !== null
            ? `${categoryLabel(est.classe)}${est.complete ? "" : " au moins (activités à compléter)"} · ${activities.length} activité${activities.length > 1 ? "s" : ""}`
            : "Nomenclature des établissements dangereux, insalubres ou incommodes, classement de l’établissement et étude ANPE."
        }
        actions={
          writable ? (
            <Menu
              align="end"
              trigger={
                <Button icon aria-label="Plus d’actions">
                  <MoreHorizontal size={16} />
                </Button>
              }
            >
              <MenuItem icon={<Copy size={15} />} onSelect={copyIt}>
                Dupliquer
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={15} />} danger onSelect={deleteIt}>
                Supprimer
              </MenuItem>
            </Menu>
          ) : undefined
        }
      />
      <Tabs<ClassView>
        label="Classement"
        value={view}
        onChange={go}
        tabs={[
          { value: "search", label: "Nomenclature" },
          { value: "establishment", label: "Mon établissement", count: activities.length },
          ...(report ? [{ value: "report" as const, label: "Synthèse" }] : []),
        ]}
      />

      {view === "search" ? (
        <div className={s.columns}>
          <Nomenclature query={query} setQuery={setQuery} section={section} setSection={setSection} code={code} setCode={setCode} count={count} add={add} />
          <aside className={s.aside} aria-label="Mon établissement">
            <Panel title={`Mon établissement (${activities.length})`}>
              {activities.length ? (
                <div className={s.stack}>
                  {est.classe !== null ? (
                    <div className={s.verdict}>
                      <ClasseBadge classe={est.classe} />
                      <span className={s.note}>{est.complete ? "Catégorie de l’établissement" : "Au moins cette catégorie : activités à compléter"}</span>
                    </div>
                  ) : (
                    <span className={s.note}>Complétez les activités pour obtenir le classement.</span>
                  )}
                  <Button onClick={() => go("establishment")}>
                    Compléter le dossier <ArrowRight size={14} />
                  </Button>
                </div>
              ) : (
                <p className={s.note}>Ajoutez les rubriques des activités du site : leur catégorie et l’étude ANPE s’y calculent.</p>
              )}
            </Panel>
          </aside>
        </div>
      ) : null}

      {view === "establishment" ? (
        <div className={s.stack}>
          <div style={{ maxWidth: "32rem" }}>
            <TextField
              id="establishment-name"
              label="Nom de l’établissement"
              maxLength={180}
              value={c.nom}
              onChange={(e) => change((x) => ({ ...x, nom: e.target.value }))}
              placeholder="Le nom de l’établissement ou du site"
              disabled={!writable}
            />
          </div>
          {report ? (
            <Notice
              tone={reportStale ? "warning" : "info"}
              title={`Synthèse validée : ${categoryLabel(report.establishment.classe)}${report.environment.study ? ` · ${report.environment.study.title}` : ""}`}
              actions={
                <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button size="sm" onClick={() => go("report")}>
                    Voir la synthèse
                  </Button>
                  {registerAction}
                </span>
              }
            >
              {reportStale
                ? "Le dossier a changé depuis : validez à nouveau pour mettre la synthèse à jour."
                : `Générée le ${new Date(report.generatedAt).toLocaleDateString("fr-FR")}${registre ? ` · registre « ${registre.nom} »` : ""}`}
            </Notice>
          ) : null}
          {activities.length ? (
            <>
              <Establishment
                est={est}
                update={update}
                remove={remove}
                clear={() => {
                  if (confirm(`Retirer ${activities.length > 1 ? `les ${activities.length} activités` : "l’activité"} de l’établissement ? Les quantités et les choix ANPE seront perdus.`))
                    setActivities(() => []);
                }}
                open={open}
              />
              <Study
                activities={activities}
                situation={c.situation}
                sensitive={c.sensible}
                setSituation={(situation: Situation) => change((x) => ({ ...x, situation }))}
                setSensitive={(sensible: boolean) => change((x) => ({ ...x, sensible }))}
                update={update}
              />
              <div ref={validationRef} tabIndex={-1} id="dossier-validation">
                <Panel title="Valider et préparer la synthèse">
                  <div className={s.stack}>
                    <p className={s.note}>Confirmez vos activités et vos choix ANPE pour générer une synthèse complète, avec tous les cas et seuils.</p>
                    {validationErrors.length ? (
                      <Notice tone="danger" title="Informations à compléter avant la validation">
                        {validationErrors.join(" ")}
                      </Notice>
                    ) : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Button variant="primary" onClick={validate} disabled={!writable}>
                        <Check size={15} /> {report ? "Valider à nouveau" : "Valider et générer la synthèse"}
                      </Button>
                      <Button onClick={toSearch}>
                        <Search size={15} /> Ajouter une autre activité
                      </Button>
                    </div>
                    <p className={s.note}>La synthèse s’imprime en PDF, et s’exporte en HTML et en données JSON. Le classement est enregistré à chaque modification.</p>
                  </div>
                </Panel>
              </div>
            </>
          ) : (
            <Panel>
              <EmptyState
                icon={<Building2 size={20} />}
                title="Aucune activité sélectionnée"
                actions={
                  <Button variant="primary" onClick={toSearch}>
                    <Search size={15} /> Rechercher une activité
                  </Button>
                }
              >
                Recherchez une rubrique et utilisez « Ajouter » pour commencer le classement. À préparer : les activités exercées sur le site, les capacités ou
                quantités présentes, la situation de l’établissement.
              </EmptyState>
            </Panel>
          )}
          <p className={s.note}>Un outil d’aide à la décision : le texte officiel fait foi.</p>
        </div>
      ) : null}

      {view === "report" ? (
        report ? (
          <div className={s.stack}>
            <div>
              <Button variant="ghost" size="sm" onClick={() => go("establishment")}>
                <ArrowLeft size={14} /> Revenir au dossier
              </Button>
            </div>
            <Notice
              title={registre ? `Registre de l’établissement : « ${registre.nom} »` : "Étape suivante : le registre réglementaire de cet établissement"}
              actions={registerAction}
            >
              {registre
                ? "Les textes qui s’appliquent au site y sont suivis. Un classement changé et validé à nouveau peut mettre à jour son profil (Créer le registre, puis Mettre à jour ce registre)."
                : "Les textes qui s’appliquent selon la catégorie, les rubriques et l’étude ANPE sont proposés d’office ; complétez le profil du site, puis évaluez la conformité texte par texte."}
              {reportStale ? " Validez à nouveau la synthèse : le dossier a changé depuis." : ""}
            </Notice>
            <ClassificationReportView key={report.generatedAt} report={report} stale={reportStale} />
          </div>
        ) : (
          <Notice title="Aucune synthèse : validez d’abord le dossier." />
        )
      ) : null}

      {notice ? (
        <div className={s.toast} role="status">
          <Notice
            title={notice}
            actions={
              <Button
                size="sm"
                onClick={() => {
                  go("establishment");
                  setNotice("");
                }}
              >
                Voir
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
