"use client";

import { useRef, useState } from "react";
import { categoryLabel, type ClassificationReport } from "@/lib/report";
import { fmtRatio } from "@/lib/establishment";
import { SITUATIONS } from "@/lib/studies";

export const REPORT_CSS = `
.report-document{font-family:Arial,sans-serif;color:#202e3a;font-size:14px;line-height:1.65;background:#fff;overflow-wrap:anywhere}
.report-document *{box-sizing:border-box}.report-document h2,.report-document h3,.report-document h4{font-family:Arial,sans-serif;color:#123650;line-height:1.4;letter-spacing:0}.report-document h2{font-size:26px;margin:18px 0 10px}.report-document h3{font-size:19px;border-bottom:2px solid #155a83;padding-bottom:9px;margin:30px 0 16px}.report-document h4{font-size:15px;margin:22px 0 10px}.report-document p{margin:8px 0 12px;line-height:1.7}.report-document ul,.report-document ol{padding-left:22px}.report-document li{margin-bottom:8px}.report-document .report-masthead{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:2px solid #123650;padding-bottom:18px}.report-document .report-masthead img{width:135px;height:auto;max-width:35%}.report-document .report-wordmark{font-size:23px;font-weight:700;color:#155a83}.report-document .report-subtitle{font-size:12px;color:#606d79}.report-document .report-metadata{color:#606d79;font-size:12px}.report-document .report-verdict{border-left:4px solid #155a83;background:#f3f5f7;padding:16px 18px;margin:20px 0}.report-document .report-verdict strong{display:block;font-size:22px;color:#123650}.report-document dl{display:grid;grid-template-columns:minmax(130px,1fr) minmax(0,2fr);margin:16px 0}.report-document dt,.report-document dd{padding:9px 0;border-bottom:1px solid #dbe1e6;margin:0}.report-document dt{color:#606d79;padding-right:16px}.report-document dd{font-weight:500}.report-document .report-table-wrap{max-width:100%;overflow-x:auto;margin:16px 0}.report-document caption{text-align:left;font-size:12px;font-weight:600;padding:0 0 8px}.report-document table{width:100%;border-collapse:collapse;font-size:12px}.report-document th,.report-document td{border:1px solid #cbd5dd;text-align:left;vertical-align:top;padding:9px;white-space:normal;overflow-wrap:anywhere}.report-document th{background:#edf2f6;font-weight:700;color:#123650}.report-document .report-selected td{background:#edf4f9}.report-document .report-small{font-size:12px;color:#606d79}.report-document .report-selected-label{display:block;font-weight:700;color:#155a83;margin-top:6px}.report-document .report-notice{padding:12px 15px;border-left:3px solid #b77f28;background:#fff6e8;margin:16px 0}.report-document .report-activity{margin-top:28px}.report-document .report-activity-title{display:flex;align-items:baseline;gap:12px}.report-document .report-activity-title span{font-size:12px;color:#606d79}.report-document .report-footer{border-top:1px solid #cbd5dd;margin-top:32px;padding-top:16px;font-size:11px;color:#606d79}.report-document .report-url{font-size:11px;word-break:break-all}.report-document .report-break{margin-top:32px}
@media(max-width:559px){.report-document h2{font-size:22px}.report-document dl{grid-template-columns:1fr}.report-document dt{border-bottom:0;padding-bottom:0}.report-document dd{padding-top:3px}.report-document .report-table-wrap table{min-width:600px}}
@media print{@page{size:A4;margin:16mm 14mm}.report-document{font-size:10pt}.report-document h2{font-size:21pt}.report-document h3{font-size:15pt;break-after:avoid}.report-document h4{break-after:avoid}.report-document p{orphans:3;widows:3}.report-document table{font-size:9pt;table-layout:fixed;min-width:0!important}.report-document thead{display:table-header-group}.report-document tr{break-inside:avoid}.report-document .report-table-wrap{overflow:visible}.report-document .report-activity{break-before:page}.report-document .report-masthead,.report-document .report-verdict{break-inside:avoid}.report-document .report-selected td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function saveFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function embeddedLogo() {
  const response = await fetch("/brand/abc-consulting.jpg");
  if (!response.ok) throw new Error("Logo indisponible");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du logo impossible"));
    reader.readAsDataURL(blob);
  });
}

export function ClassificationReportView({
  report,
  stale,
}: {
  report: ClassificationReport;
  stale: boolean;
}) {
  const bodyRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const filename = `ABClassement-${report.generatedAt.slice(0, 10)}`;
  const study = report.environment.study!;
  const sourcePage = (reference: string) => {
    const source = report.sources.find((s) => s.id === reference.split(" ")[0]);
    const page = reference.match(/p\.(\d+)/)?.[1];
    return `${source ? `Arrêté de ${source.id}` : reference}${page ? `, page ${page} du PDF` : ""}`;
  };
  const downloadHtml = async () => {
    if (stale || !bodyRef.current) return;
    setExporting(true);
    setExportError("");
    setExportStatus("");
    try {
      const clone = bodyRef.current.cloneNode(true) as HTMLElement;
      const logo = clone.querySelector("img");
      if (logo) logo.src = await embeddedLogo();
      // The report content comes from React's escaped text nodes, not raw user HTML.
      saveFile(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ABClassement — Synthèse détaillée</title><style>body{margin:0;padding:32px 20px}.report-document{max-width:1050px;margin:auto}${REPORT_CSS}</style></head><body>${clone.outerHTML}</body></html>`,
        `${filename}.html`,
        "text/html;charset=utf-8",
      );
      setExportStatus(
        "Rapport HTML téléchargé. Il contient le logo et peut être ouvert sans connexion.",
      );
    } catch {
      setExportError(
        "Le téléchargement a échoué. Réessayez ou utilisez « Imprimer / PDF ».",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <section
      className="report-section"
      aria-label="Synthèse détaillée du classement"
    >
      <style>{REPORT_CSS}</style>
      <div className="report-toolbar">
        <div>
          <div className="eyebrow">RÉSULTAT DE LA VALIDATION</div>
          <h2>Synthèse détaillée</h2>
          <p>
            Rapport complet, incluant tous les cas et seuils des rubriques
            sélectionnées.
          </p>
        </div>
        <div className="report-export-actions">
          <button onClick={() => window.print()} disabled={stale || exporting}>
            Imprimer / PDF
          </button>
          <button
            className="secondary-button"
            onClick={downloadHtml}
            disabled={stale || exporting}
          >
            {exporting ? "Préparation…" : "Télécharger le rapport HTML"}
          </button>
          <button
            className="secondary-button"
            disabled={stale || exporting}
            onClick={() => {
              saveFile(
                JSON.stringify(report, null, 2),
                `${filename}.json`,
                "application/json;charset=utf-8",
              );
              setExportStatus(
                "Données détaillées téléchargées au format JSON.",
              );
            }}
          >
            Données JSON
          </button>
        </div>
      </div>
      <nav className="report-toc" aria-label="Sections de la synthèse">
        {[
          ["report-s1", "1. Résultat"],
          ["report-s2", "2. Activités et seuils"],
          ["report-s3", "3. Règle d’addition"],
          ["report-s4", "4. Étude ANPE"],
          ["report-s5", "5. Références"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <p className="report-export-help">
        Pour un PDF, choisissez « Enregistrer au format PDF » dans la fenêtre
        d’impression. Le rapport HTML est un document complet à conserver ou à
        transmettre.
      </p>
      <p className="small" role="status" aria-live="polite">
        {exportStatus}
      </p>
      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}
      <article className="report-document" ref={bodyRef}>
        {stale && (
          <p className="report-notice" role="alert">
            <strong>Dossier modifié depuis la validation.</strong> Cette
            synthèse correspond aux anciennes données. Validez à nouveau pour
            actualiser le rapport et réactiver l’export.
          </p>
        )}
        <header className="report-masthead">
          <div>
            <div className="report-wordmark">ABClassement</div>
            <div className="report-subtitle">
              Classement & environnement — Tunisie
            </div>
          </div>
          <img
            src="/brand/abc-consulting.jpg"
            alt="ABC Consulting"
            width="763"
            height="366"
          />
        </header>
        <h2>Synthèse détaillée de classement</h2>
        {report.name && (
          <p>
            <strong>Établissement : {report.name}</strong>
          </p>
        )}
        <p className="report-metadata">
          Établie le {new Date(report.generatedAt).toLocaleString("fr-FR")} ·{" "}
          {report.activities.length} activité(s) · Données confirmées par
          l’utilisateur
        </p>
        <div className="report-verdict">
          <span>Classement retenu pour l’établissement</span>
          <strong>{categoryLabel(report.establishment.classe)}</strong>
          <p>Déterminé par : {report.establishment.decidedBy.join(" ; ")}.</p>
          <p className="report-small">
            L’établissement retient la catégorie la plus élevée de ses
            activités, après application des règles d’addition. Une seule
            demande couvre l’ensemble de l’établissement (décret n° 2006-2687,
            art. 5).
          </p>
        </div>
        <h3 id="report-s1">1. Situation et résultat d’ensemble</h3>
        <dl>
          <dt>Situation déclarée</dt>
          <dd>{SITUATIONS[report.situation]}</dd>
          <dt>Zone protégée ou sensible</dt>
          <dd>
            {report.sensitive
              ? "Oui — site susceptible d’affecter une zone protégée ou sensible"
              : "Non signalée par l’utilisateur"}
          </dd>
          <dt>Étude à fournir</dt>
          <dd>{study.title}</dd>
          <dt>Délai de l’ANPE</dt>
          <dd>
            {study.delay ??
              "Aucun délai indiqué pour cette démarche dans le référentiel de l’outil"}
          </dd>
        </dl>
        <div className="report-table-wrap">
          <table>
            <caption>Récapitulatif des activités déclarées</caption>
            <thead>
              <tr>
                <th>Activité / rubrique</th>
                <th>Cas déclaré</th>
                <th>Quantité saisie</th>
                <th>Classement</th>
                <th>Étude par activité</th>
              </tr>
            </thead>
            <tbody>
              {report.activities.map((a) => (
                <tr key={a.number}>
                  <td>
                    {a.number}. {a.rubrique.code} — {a.rubrique.title}
                  </td>
                  <td>{a.selectedCase}</td>
                  <td>
                    {a.quantity
                      ? `${a.quantity} ${a.unit ?? ""}`
                      : "Sans quantité : classement selon le cas déclaré"}
                  </td>
                  <td>{categoryLabel(a.category)}</td>
                  <td>{a.environmentalStudy.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 id="report-s2">2. Détail des activités et des seuils</h3>
        <p>
          Les tableaux ci-dessous reproduisent tous les cas et seuils de chaque
          rubrique sélectionnée. Les lignes retenues pour le calcul sont
          signalées. Les autres lignes restent présentes pour permettre la
          vérification.
        </p>
        {report.activities.map((a) => (
          <section className="report-activity" key={a.number}>
            <div className="report-activity-title">
              <span>ACTIVITÉ {a.number}</span>
              <h3>
                {a.rubrique.code} — {a.rubrique.title}
              </h3>
            </div>
            <p>
              <strong>Libellé complet de la rubrique</strong>
            </p>
            <p>{a.rubrique.text}</p>
            <dl>
              <dt>Secteur</dt>
              <dd>{a.section ?? "Non précisé"}</dd>
              <dt>Cas sélectionné</dt>
              <dd>{a.selectedCase}</dd>
              <dt>Quantité / capacité saisie</dt>
              <dd>
                {a.quantity
                  ? `${a.quantity} ${a.unit ?? ""}`
                  : "Non requise pour le cas déclaré"}
              </dd>
              <dt>Quantité normalisée pour le calcul</dt>
              <dd>
                {a.canonicalQuantity
                  ? `${a.canonicalQuantity.value.toLocaleString("fr-FR", { maximumFractionDigits: 9 })} ${a.canonicalQuantity.unit}`
                  : "Sans objet"}
              </dd>
              <dt>Catégorie de l’activité</dt>
              <dd>{categoryLabel(a.category)}</dd>
              <dt>Règle d’addition</dt>
              <dd>
                {a.additionGroup
                  ? `Groupe ${a.additionGroup}`
                  : "Rubrique hors des groupes d’addition"}
              </dd>
              <dt>Version de la rubrique</dt>
              <dd>
                Arrêté de {a.rubrique.source}
                {a.rubrique.replaces
                  ? ` — remplace la version ${a.rubrique.replaces}`
                  : ""}
                {a.rubrique.amended_by?.length
                  ? ` ; modifications : ${a.rubrique.amended_by.join(", ")}`
                  : ""}
              </dd>
            </dl>
            <h4>Justification du classement</h4>
            <p>{a.reason}</p>
            {a.notes.length > 0 && (
              <ul className="report-notice">
                {a.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <h4>Tous les cas et seuils de la rubrique {a.rubrique.code}</h4>
            <div className="report-table-wrap">
              <table>
                <caption>Seuils complets — rubrique {a.rubrique.code}</caption>
                <thead>
                  <tr>
                    <th>Cas / sous-cas</th>
                    <th>Critère du texte</th>
                    <th>Seuil et unité</th>
                    <th>Catégorie</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {a.thresholds.map((t) => (
                    <tr
                      key={t.number}
                      className={t.selected ? "report-selected" : ""}
                    >
                      <td>
                        {t.path.length ? t.path.join(" › ") : "Cas général"}
                        {t.context && (
                          <p className="report-small">{t.context}</p>
                        )}
                        {t.selected && (
                          <span className="report-selected-label">
                            Ligne retenue pour le classement
                          </span>
                        )}
                      </td>
                      <td>{t.criterion || a.rubrique.title}</td>
                      <td>
                        {t.threshold}
                        {t.condition?.unit_inferred && (
                          <p className="report-small">
                            Unité déduite des autres lignes : vérifier le texte
                            officiel.
                          </p>
                        )}
                        {t.condition?.manual && (
                          <p className="report-small">
                            Condition nécessitant une lecture du cas et une
                            confirmation.
                          </p>
                        )}
                      </td>
                      <td>{categoryLabel(t.category)}</td>
                      <td>{sourcePage(t.ref)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4>Correspondance environnementale déclarée</h4>
            {a.environmentalEntry ? (
              <>
                <p>
                  <strong>
                    {a.environmentalEntry.id.startsWith("CDC")
                      ? "Annexe 2"
                      : `Annexe 1, catégorie ${a.environmentalEntry.annexe}`}
                    , n° {a.environmentalEntry.number}
                  </strong>{" "}
                  — {a.environmentalEntry.text}
                </p>
                {a.entryConditions.length > 0 && (
                  <p>
                    Condition de rapprochement proposée :{" "}
                    {a.entryConditions.join(" ; ")}.
                  </p>
                )}
              </>
            ) : (
              <p>
                Aucune entrée propre déclarée : activité annexe ou activité ne
                figurant dans aucune annexe.
              </p>
            )}
            {a.entryNote && (
              <p className="report-small">
                Note de correspondance : {a.entryNote}
              </p>
            )}
            <p>
              <strong>Étude correspondante :</strong>{" "}
              {a.environmentalStudy.title}.{" "}
              {a.environmentalStudy.delay &&
                `Délai : ${a.environmentalStudy.delay}.`}
            </p>
            <p className="report-small">Base : {a.environmentalStudy.basis}.</p>
          </section>
        ))}
        <h3 id="report-s3" className="report-break">3. Règles d’addition et calculs</h3>
        <p>
          Pour les substances d’un même groupe, la règle d’addition compare la
          somme des rapports qx/Qx à 1. Base : arrêté du 23 février 2010, art. 2
          bis.
        </p>
        {!report.establishment.additions.length && (
          <p>
            Aucun groupe ne comporte au moins deux substances classées
            permettant un calcul d’addition dans ce dossier. Aucune addition n’a
            été appliquée.
          </p>
        )}
        {report.establishment.additions.map((a) => (
          <section key={a.group}>
            <h4>Groupe {a.group}</h4>
            <p>
              Catégorie avant addition : {categoryLabel(a.base)}. Catégorie
              examinée :{" "}
              {a.target
                ? categoryLabel(a.target)
                : "Déjà en première catégorie"}
              .
            </p>
            <div className="report-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rubrique</th>
                    <th>qx — quantité normalisée</th>
                    <th>Qx — seuil comparé</th>
                    <th>qx / Qx</th>
                  </tr>
                </thead>
                <tbody>
                  {a.members.map((m, i) => (
                    <tr key={i}>
                      <td>
                        {m.result.rub.code} — {m.result.rub.title}
                      </td>
                      <td>
                        {m.result.q
                          ? `${m.result.q.value.toLocaleString("fr-FR")} ${m.result.q.unit}`
                          : "Sans objet"}
                      </td>
                      <td>
                        {m.Q !== null
                          ? `${m.Q.toLocaleString("fr-FR")} ${m.result.q?.unit ?? ""}`
                          : (m.note ??
                            "Sans objet : groupe déjà en première catégorie")}
                      </td>
                      <td>
                        {m.ratio !== null ? fmtRatio(m.ratio) : "Non calculé"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {a.target && (
              <p>
                <strong>Somme Σ qx/Qx = {fmtRatio(a.sum)}</strong> —{" "}
                {a.upgraded
                  ? "Relèvement de la catégorie appliqué."
                  : "Pas de relèvement appliqué."}
              </p>
            )}
            <p>{a.reason}</p>
          </section>
        ))}
        <h3 id="report-s4">4. Étude environnementale et démarches</h3>
        <p>
          <strong>{study.title}</strong>
        </p>
        <p>Base : {study.basis}.</p>
        {study.delay && <p>Délai de l’ANPE : {study.delay}.</p>}
        <p>
          {report.sensitive
            ? "Le risque d’affecter une zone protégée ou sensible est déclaré et pris en compte dans les démarches ci-dessous."
            : "Aucune zone protégée ou sensible n’a été signalée dans les paramètres du dossier."}
        </p>
        <ol>
          {study.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {new Set(report.environment.perActivity).size > 1 && (
          <p>
            L’établissement retient l’étude la plus exigeante parmi celles de
            ses activités.
          </p>
        )}
        {study.kind === "depollution" && (
          <p className="report-notice">
            La circulaire n° 27 du 7 novembre 2024 ouvrait cette régularisation
            jusqu’au 31 décembre 2025. Vérifiez auprès de l’ANPE qu’elle est
            toujours en vigueur.
          </p>
        )}
        <p className="report-small">
          Les correspondances entre rubriques EDII et annexes ANPE reposent sur
          les conditions déclarées par l’utilisateur. Elles doivent être
          confirmées pour chaque activité.
        </p>
        <h3 id="report-s5">5. Références et traçabilité</h3>
        <ul>
          {report.sources.map((s) => (
            <li key={s.id}>
              {s.title}. {s.jort}.{" "}
              {s.role === "base" ? "Texte de base." : "Texte modificatif."}
            </li>
          ))}
          <li>{report.environmentalSource.title}.</li>
          <li>
            Décret n° 2006-2687 du 9 octobre 2006 — procédures d’ouverture et
            d’exploitation des établissements dangereux, insalubres ou
            incommodes, notamment art. 5.
          </li>
        </ul>
        <p className="report-small">
          Version du rapport : {report.schemaVersion}. Date technique de
          génération : {report.generatedAt}. Les seuils et calculs correspondent
          au référentiel intégré à ABClassement lors de cette génération.
        </p>
        <div className="report-footer">
          <strong>ABClassement — ABC Consulting</strong>
          <p>
            Document d’aide à la décision établi à partir des données déclarées.
            La validation confirme la complétude des informations pour le calcul
            ; elle ne constitue pas une autorisation administrative. Le texte
            officiel fait foi.
          </p>
        </div>
      </article>
    </section>
  );
}
