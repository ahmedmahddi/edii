"use client";
/**
 * The compliance report of one establishment, laid out as an A4 document: shown over the app, and
 * printed or saved as PDF by the browser ("Imprimer / PDF"; on a phone, Share → Print → PDF).
 * Its data comes from lib/registre/rapport.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, Checkbox, TextField } from "@/app/ui";
import s from "./rapport-conformite.module.css";
import { rapportConformite } from "@/lib/registre/rapport";
import type { Texte } from "@/lib/registre/referentiel";
import type { Registre } from "@/lib/registre/registre";
import { categoryLabel } from "@/lib/report";
import { metierLabels } from "@/lib/registre/profil";
import { study } from "@/lib/studies";
import type { Amendment } from "@/lib/veille/watch";

/** The module's class names, from their names (falsy ones dropped). */
const cx = (...names: (string | false)[]) =>
  names
    .filter((n): n is string => !!n)
    .map((n) => s[n] ?? n)
    .join(" ");

const dateFr = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");
const dateCourt = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const ETAT_NC = { "en-retard": "En retard", "a-venir": "À venir", "a-planifier": "À planifier" } as const;
// The appendix: what needs attention first.
const ORDRE = ["Non conforme", "À évaluer", "Conforme", "Non applicable"];
const ETAT_EVAL: Record<string, string> = { "en-retard": "En retard", bientot: "Sous 30 jours", "a-evaluer": "À évaluer", "a-jour": "À jour" };

export function RapportConformite({
  reg,
  amendments,
  texts,
  espace,
  auteur,
  onClose,
}: {
  reg: Registre;
  amendments: Amendment[];
  texts: Texte[];
  espace: string | null;
  auteur: string | null;
  onClose: () => void;
}) {
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [depuis, setDepuis] = useState(yearAgo);
  const [annexe, setAnnexe] = useState(true);
  const r = useMemo(() => rapportConformite(reg, amendments, texts, new Date(), depuis), [reg, amendments, texts, depuis]);
  useEffect(() => {
    document.body.classList.add("has-rapport");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    window.scrollTo({ top: 0 });
    return () => {
      document.body.classList.remove("has-rapport");
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const t = r.totaux;
  const metiers = metierLabels(reg.site);
  const classement = reg.classe === null && !reg.activites.length ? "Établissement sans classement" : categoryLabel(reg.classe);
  return createPortal(
    <div data-rapport="" data-ui="" className={cx("root")} role="dialog" aria-modal="true" aria-label="Rapport de conformité">
      <div className={cx("toolbar")}>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={15} /> Fermer
        </Button>
        <TextField label="Période depuis" type="date" value={depuis} max={r.date} onChange={(e) => setDepuis(e.target.value || yearAgo)} />
        <span className={cx("check")}>
          <Checkbox checked={annexe} onChange={(e) => setAnnexe(e.target.checked)}>
            Liste complète des textes
          </Checkbox>
        </span>
        <Button variant="primary" className={cx("print")} onClick={() => window.print()}>
          <Printer size={15} /> Imprimer / PDF
        </Button>
      </div>

      <article className={cx("doc")}>
        <header className={cx("masthead")}>
          <div>
            <p className={cx("kicker")}>État de conformité réglementaire</p>
            <h1>{reg.nom}</h1>
            <p className={cx("meta")}>
              {espace ? `${espace} · ` : ""}Arrêté au {dateFr(r.date)} · période du {dateFr(r.depuis)} au {dateFr(r.date)}
            </p>
          </div>
          <img src="/brand/abc-consulting.jpg" alt="ABC Consulting" width="763" height="366" />
        </header>

        <section className={cx("section")}>
          <h2>1. Synthèse</h2>
          <div className={cx("kpis")}>
            <div className={cx("kpi", "is-main")}>
              <strong>{t.taux === null ? "—" : `${t.taux} %`}</strong>
              <span>taux de conformité</span>
              <small>conformes / (conformes + non conformes)</small>
            </div>
            <div className={cx("kpi")}>
              <strong>{t.progression} %</strong>
              <span>des textes évalués</span>
              <small>
                {t.evalues} sur {t.applicables}
              </small>
            </div>
            <div className={cx("kpi")}>
              <strong>{t.C}</strong>
              <span>conformes</span>
            </div>
            <div className={cx("kpi", t.NC > 0 && "is-bad")}>
              <strong>{t.NC}</strong>
              <span>non conformes</span>
            </div>
            <div className={cx("kpi")}>
              <strong>{t.NA}</strong>
              <span>non applicables</span>
            </div>
            <div className={cx("kpi", t.enRetard > 0 && "is-bad")}>
              <strong>{t.enRetard}</strong>
              <span>évaluations en retard</span>
            </div>
          </div>
          <dl className={cx("facts")}>
            <div>
              <dt>Classement</dt>
              <dd>
                {classement}
                {reg.activites.length ? ` · rubriques ${reg.activites.map((a) => a.code).join(", ")}` : ""}
              </dd>
            </div>
            {reg.etude ? (
              <div>
                <dt>Étude ANPE</dt>
                <dd>{study(reg.etude, false).title}</dd>
              </div>
            ) : null}
            {metiers.length ? (
              <div>
                <dt>Activités</dt>
                <dd>{metiers.join(", ")}</dd>
              </div>
            ) : null}
            <div>
              <dt>Sur la période</dt>
              <dd>
                {r.evaluationsPeriode} évaluation{r.evaluationsPeriode > 1 ? "s" : ""} enregistrée{r.evaluationsPeriode > 1 ? "s" : ""}, {r.actionsRealisees.length} action
                {r.actionsRealisees.length > 1 ? "s" : ""} corrective{r.actionsRealisees.length > 1 ? "s" : ""} réalisée{r.actionsRealisees.length > 1 ? "s" : ""}
              </dd>
            </div>
          </dl>
        </section>

        <section className={cx("section")}>
          <h2>2. Conformité par domaine</h2>
          <table className={cx("table")}>
            <thead>
              <tr>
                <th>Domaine</th>
                <th className={cx("num")}>Textes</th>
                <th className={cx("num")}>C</th>
                <th className={cx("num")}>NC</th>
                <th className={cx("num")}>NA</th>
                <th className={cx("num")}>À évaluer</th>
                <th className={cx("num")}>Taux</th>
              </tr>
            </thead>
            <tbody>
              {r.domaines.map((d) => (
                <tr key={d.domaine}>
                  <td>{d.label}</td>
                  <td className={cx("num")}>{d.total}</td>
                  <td className={cx("num")}>{d.C}</td>
                  <td className={cx("num", d.NC > 0 && "is-bad")}>{d.NC}</td>
                  <td className={cx("num")}>{d.NA}</td>
                  <td className={cx("num")}>{d.aEvaluer}</td>
                  <td className={cx("num")}>
                    <span className={cx("bar")}>
                      <span style={{ width: `${d.taux ?? 0}%` }} />
                    </span>
                    {d.taux === null ? "—" : `${d.taux} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={cx("section")}>
          <h2>3. Non-conformités et plan d’actions</h2>
          {r.nonConformites.length ? (
            <table className={cx("table", "is-fixed")}>
              <colgroup><col style={{ width: "27%" }} /><col style={{ width: "18%" }} /><col style={{ width: "23%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /></colgroup>
              <thead>
                <tr>
                  <th>Texte</th>
                  <th>Constat</th>
                  <th>Action</th>
                  <th>Responsable</th>
                  <th>Échéance</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {r.nonConformites.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <strong>{n.ref}</strong>
                      <small>{n.titre}</small>
                      <small>NC depuis le {dateCourt(n.depuis)}</small>
                    </td>
                    <td>{n.constat || "—"}</td>
                    <td>{n.action || "—"}</td>
                    <td>{n.responsable || "—"}</td>
                    <td className={cx("date")}>{dateCourt(n.echeance)}</td>
                    <td>
                      <span className={cx("tag", `tag-${n.etat}`)}>{ETAT_NC[n.etat]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={cx("empty")}>Aucune non-conformité ouverte.</p>
          )}
        </section>

        <section className={cx("section")}>
          <h2>4. Actions réalisées sur la période</h2>
          {r.actionsRealisees.length ? (
            <ul className={cx("list")}>
              {r.actionsRealisees.map((a) => (
                <li key={a.id}>
                  <strong>{dateCourt(a.date)}</strong> · {a.ref} — {a.titre}
                </li>
              ))}
            </ul>
          ) : (
            <p className={cx("empty")}>Aucune action corrective close sur la période.</p>
          )}
        </section>

        <section className={cx("section")}>
          <h2>5. Évaluations en retard et à venir (30 jours)</h2>
          {r.aVenir.length ? (
            <table className={cx("table", "is-fixed")}>
              <colgroup><col style={{ width: "70%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /></colgroup>
              <thead>
                <tr>
                  <th>Texte</th>
                  <th>Prévue le</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {r.aVenir.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.ref}</strong>
                      <small>{a.titre}</small>
                    </td>
                    <td className={cx("date")}>{dateCourt(a.date)}</td>
                    <td>
                      <span className={cx("tag", `tag-${a.etat}`)}>{ETAT_EVAL[a.etat]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={cx("empty")}>Aucune évaluation en retard ni prévue sous 30 jours.</p>
          )}
          {t.aEvaluer ? (
            <p className={cx("note")}>
              {t.aEvaluer} texte{t.aEvaluer > 1 ? "s" : ""} du registre {t.aEvaluer > 1 ? "n’ont" : "n’a"} pas encore été évalué{t.aEvaluer > 1 ? "s" : ""}.
            </p>
          ) : null}
        </section>

        <section className={cx("section")}>
          <h2>6. Veille réglementaire</h2>
          {r.jort.modifies.length ? (
            <ul className={cx("list")}>
              {r.jort.modifies.map((m) => (
                <li key={`${m.id}-${m.amendment}`}>
                  <strong>{m.ref}</strong> est modifié par : {m.par} ({m.jort}) — à réévaluer.
                </li>
              ))}
            </ul>
          ) : (
            <p className={cx("empty")}>Aucun texte du registre modifié au Journal officiel depuis sa dernière prise en compte.</p>
          )}
          {r.jort.nouveaux ? (
            <p className={cx("note")}>
              {r.jort.nouveaux} nouveau{r.jort.nouveaux > 1 ? "x" : ""} texte{r.jort.nouveaux > 1 ? "s" : ""} applicable{r.jort.nouveaux > 1 ? "s" : ""} au site
              {r.jort.nouveaux > 1 ? " sont" : " est"} à examiner pour l’ajouter au registre.
            </p>
          ) : null}
        </section>

        {annexe ? (
          <section className={cx("section", "annexe")}>
            <h2>Annexe : textes applicables ({r.textes.length})</h2>
            <table className={cx("table", "is-dense", "is-fixed")}>
              <colgroup><col style={{ width: "46%" }} /><col style={{ width: "12%" }} /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "20%" }} /></colgroup>
              <thead>
                <tr>
                  <th>Texte</th>
                  <th>Conformité</th>
                  <th>Dernière évaluation</th>
                  <th>Prochaine</th>
                  <th>Preuves</th>
                </tr>
              </thead>
              <tbody>
                {[...r.textes].sort((a, b) => ORDRE.indexOf(a.conformite) - ORDRE.indexOf(b.conformite)).map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{x.ref}</strong>
                      <small>{x.titre}</small>
                    </td>
                    <td>{x.conformite}</td>
                    <td className={cx("date")}>{dateCourt(x.evalue)}</td>
                    <td className={cx("date")}>
                      {dateCourt(x.prochaine)}
                      {x.etat === "en-retard" ? <small className={cx("is-bad")}>en retard</small> : null}
                    </td>
                    <td>{x.preuves.length ? x.preuves.join(" · ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <footer className={cx("signatures")}>
          <div>
            <span>Établi par</span>
            <strong>{auteur ?? ""}</strong>
            <em>Date et signature</em>
          </div>
          <div>
            <span>Visa de la direction</span>
            <strong />
            <em>Date et signature</em>
          </div>
        </footer>
        <p className={cx("foot")}>
          Établi avec ABClassement (ABC Consulting) à partir du registre de veille réglementaire de l’établissement. Document d’aide au suivi : le texte officiel
          fait foi.
        </p>
      </article>
    </div>,
    document.body,
  );
}
