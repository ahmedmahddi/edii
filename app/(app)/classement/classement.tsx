"use client";
/**
 * Classement: the nomenclature (search, rubriques, thresholds), the establishment's dossier
 * (activities, quantities, addition rule, ANPE study) and its validated synthesis, which starts
 * the establishment's register. The dossier lives in the address (?e=…&s=…&z=1&code=…&q=…).
 */
import { ArrowLeft, ArrowRight, Building2, Check, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClassificationReportView } from "@/app/components/classification-report";
import { Button, EmptyState, Notice, PageHeader, Panel, Tabs, TextField } from "@/app/ui";
import { type Activity, classifyEstablishment, decodeActivities, encodeActivities } from "@/lib/establishment";
import { setPendingSeed } from "@/lib/registre/seed";
import { categoryLabel, type ClassificationReport, createClassificationReport, reportFingerprint } from "@/lib/report";
import { SITUATIONS, type Situation } from "@/lib/studies";
import s from "./classement.module.css";
import { Establishment, Study } from "./Dossier";
import { Nomenclature } from "./Nomenclature";
import { ClasseBadge } from "./shared";

type ClassView = "search" | "establishment" | "report";

export function Classement() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [section, setSection] = useState<string | null>(null);
  const [code, setCode] = useState(params.get("code"));
  const [activities, setActivities] = useState<Activity[]>(() => decodeActivities(params.get("e")));
  const [view, setView] = useState<ClassView>(() =>
    params.get("vue") === "etablissement" || (params.get("e") && !params.get("code") && !params.get("q")) ? "establishment" : "search",
  );
  const [notice, setNotice] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [report, setReport] = useState<ClassificationReport | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const validationRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [situation, setSituation] = useState<Situation>(() => {
    const v = params.get("s");
    return v && v in SITUATIONS ? (v as Situation) : "projet";
  });
  const [sensitive, setSensitive] = useState(params.get("z") === "1");
  const reportStale = !!report && report.fingerprint !== reportFingerprint(activities, situation, sensitive, establishmentName);
  const est = useMemo(() => classifyEstablishment(activities), [activities]);

  useEffect(() => setValidationErrors([]), [activities, situation, sensitive]);
  // The dossier in the address: a link, a reload or the back button find it again.
  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (activities.length) p.set("e", encodeActivities(activities));
    if (activities.length && situation !== "projet") p.set("s", situation);
    if (activities.length && sensitive) p.set("z", "1");
    if (query.trim()) p.set("q", query.trim());
    if (view === "establishment") p.set("vue", "etablissement");
    router.replace(p.size ? `/classement?${p}` : "/classement", { scroll: false });
  }, [code, activities, situation, sensitive, query, router, view]);
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
  const validate = () => {
    const result = createClassificationReport(activities, situation, sensitive, establishmentName);
    if (!result.ok) {
      setValidationErrors(result.issues);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setValidationErrors([]);
    setReport(result.report);
    go("report");
  };
  // The validated classification starts the establishment's register (/registres/nouveau).
  const startRegister = () => {
    if (!report) return;
    setPendingSeed(report);
    router.push("/registres/nouveau");
  };
  const open = (c: string) => {
    setCode(c);
    setView("search");
  };
  const add = (c: string) => {
    setActivities((list) => [...list, { code: c }]);
    setNotice(`Rubrique ${c} ajoutée à votre établissement`);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  };
  const update = (i: number, patch: Partial<Activity>) => setActivities((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => setActivities((list) => list.filter((_, j) => j !== i));
  const count = (c: string) => activities.filter((a) => a.code === c).length;
  const toSearch = () => {
    go("search");
    requestAnimationFrame(() => document.getElementById("activity-search")?.focus());
  };

  const reportCard = report ? (
    <Notice
      tone={reportStale ? "warning" : "info"}
      title={`Synthèse validée : ${categoryLabel(report.establishment.classe)}${report.environment.study ? ` · ${report.environment.study.title}` : ""}`}
      actions={
        <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button size="sm" onClick={() => go("report")}>
            Voir la synthèse
          </Button>
          <Button size="sm" variant="primary" disabled={reportStale} onClick={startRegister}>
            Créer le registre
          </Button>
        </span>
      }
    >
      {reportStale
        ? "Le dossier a changé depuis : validez à nouveau pour mettre la synthèse à jour."
        : `${report.name || "Établissement sans nom"} · générée le ${new Date(report.generatedAt).toLocaleDateString("fr-FR")}`}
    </Notice>
  ) : null;

  return (
    <div className={s.screen}>
      <PageHeader title="Classement" description="Nomenclature des établissements dangereux, insalubres ou incommodes, classement de l’établissement et étude ANPE." />
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
        activities.length ? (
          <div className={s.stack}>
            {reportCard}
            <Establishment
              est={est}
              update={update}
              remove={remove}
              clear={() => {
                if (confirm(`Retirer ${activities.length > 1 ? `les ${activities.length} activités` : "l’activité"} de l’établissement ? Les quantités et les choix ANPE seront perdus.`))
                  setActivities([]);
              }}
              open={open}
            />
            <Study activities={activities} situation={situation} sensitive={sensitive} setSituation={setSituation} setSensitive={setSensitive} update={update} />
            <div ref={validationRef} tabIndex={-1} id="dossier-validation">
              <Panel title="Valider et préparer la synthèse">
                <div className={s.stack}>
                  <p className={s.note}>Confirmez vos activités et vos choix ANPE pour générer une synthèse complète, avec tous les cas et seuils.</p>
                  <div style={{ maxWidth: "32rem" }}>
                    <TextField
                      id="establishment-name"
                      label="Nom de l’établissement (facultatif)"
                      maxLength={180}
                      value={establishmentName}
                      onChange={(e) => setEstablishmentName(e.target.value)}
                      placeholder="Nom à afficher sur la synthèse"
                    />
                  </div>
                  {validationErrors.length ? (
                    <Notice tone="danger" title="Informations à compléter avant la validation">
                      {validationErrors.join(" ")}
                    </Notice>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Button variant="primary" onClick={validate}>
                      <Check size={15} /> Valider et générer la synthèse
                    </Button>
                    <Button onClick={toSearch}>
                      <Search size={15} /> Ajouter une autre activité
                    </Button>
                  </div>
                  <p className={s.note}>La synthèse s’imprime en PDF, et s’exporte en HTML et en données JSON.</p>
                </div>
              </Panel>
            </div>
            <p className={s.note}>Un outil d’aide à la décision : le texte officiel fait foi.</p>
          </div>
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
              Recherchez une rubrique et utilisez « Ajouter » pour commencer le classement. À préparer : les activités exercées sur le site, les capacités ou quantités
              présentes, la situation de l’établissement.
            </EmptyState>
          </Panel>
        )
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
              title="Étape suivante : le registre réglementaire de cet établissement"
              actions={
                <Button variant="primary" disabled={reportStale} onClick={startRegister}>
                  Créer le registre <ArrowRight size={14} />
                </Button>
              }
            >
              Les textes qui s’appliquent selon la catégorie, les rubriques et l’étude ANPE sont proposés d’office ; complétez le profil du site, puis évaluez la
              conformité texte par texte.{reportStale ? " Validez à nouveau la synthèse : le dossier a changé depuis." : ""}
            </Notice>
            <ClassificationReportView key={report.generatedAt} report={report} stale={reportStale} />
          </div>
        ) : (
          <Notice title="Aucune synthèse : validez d’abord votre établissement." />
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
