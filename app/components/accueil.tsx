"use client";
/**
 * The home screen: what waits in the registers, each establishment at a glance, the latest of the
 * Journal officiel, and the way in for a new client (classify a site, or start a register).
 */
import { useEffect, useMemo, useState } from "react";
import { OffreBanner, useCloud } from "@/app/components/cloud";
import { canWrite } from "@/lib/cloud/api";
import { Icon } from "@/app/components/icons";
import { useFeed } from "@/app/components/veille";
import { metierLabels } from "@/lib/registre/profil";
import { catalogue } from "@/lib/registre/referentiel";
import { alertes, CHANGED, dues, loadRegistres, nouveautes, prochaine, type Registre, RELOADED } from "@/lib/registre/registre";
import { categoryLabel } from "@/lib/report";
import type { Hit } from "@/lib/veille/watch";

const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

interface Etat {
  reg: Registre;
  retenus: number;
  evalues: number;
  conformes: number;
  nonConformes: number;
  retard: number;
  aFaire: number; // never evaluated, or due within 30 days
  jort: number; // texts modified at the JORT
  nouveaux: number; // new texts that apply
}

function useRegistres(): Registre[] {
  const [list, setList] = useState<Registre[]>([]);
  useEffect(() => {
    const load = () => setList(loadRegistres());
    load();
    window.addEventListener(CHANGED, load);
    window.addEventListener(RELOADED, load);
    return () => {
      window.removeEventListener(CHANGED, load);
      window.removeEventListener(RELOADED, load);
    };
  }, []);
  return list;
}

export function Accueil({
  onClassify,
  onNewRegistre,
  onOpenRegistre,
  onRegistres,
  onVeille,
}: {
  onClassify: () => void;
  onNewRegistre: () => void;
  onOpenRegistre: (id: string) => void;
  onRegistres: () => void;
  onVeille: () => void;
}) {
  const cloud = useCloud();
  const feed = useFeed();
  const registres = useRegistres();
  const texts = useMemo(() => catalogue(feed?.hits ?? [], feed?.amendments ?? [], feed?.citations ?? {}), [feed]);
  const etats = useMemo<Etat[]>(() => {
    const amendments = feed?.amendments ?? [];
    return registres.map((reg) => {
      const retenus = reg.lignes.filter((l) => l.retenu);
      const due = dues(reg);
      return {
        reg,
        retenus: retenus.length,
        evalues: retenus.filter((l) => l.conformite).length,
        conformes: retenus.filter((l) => l.conformite === "C").length,
        nonConformes: retenus.filter((l) => l.conformite === "NC").length,
        retard: due.filter((l) => prochaine(l).etat === "en-retard").length,
        aFaire: due.filter((l) => prochaine(l).etat !== "en-retard").length,
        jort: alertes(reg, amendments).length,
        nouveaux: texts.length ? nouveautes(reg, texts).length : 0,
      };
    });
  }, [registres, feed, texts]);
  const total = (k: keyof Omit<Etat, "reg">) => etats.reduce((n, e) => n + e[k], 0);

  const hour = new Date().getHours();
  const hello = hour < 18 ? "Bonjour" : "Bonsoir";
  const first = cloud.name?.split(/\s+/)[0];
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const readOnly = cloud.current ? !canWrite(cloud.current) : false;

  // The Journal officiel: the last issue read, and the latest texts that matter.
  const last = feed
    ? Object.entries(feed.scanned)
        .map(([y, numbers]) => [Number(y), Math.max(...numbers)] as const)
        .sort((a, b) => b[0] - a[0])[0]
    : null;
  const lastDate = last ? feed?.hits.find((h) => h.year === last[0] && h.issue === last[1])?.date : null;
  const latest: Hit[] = useMemo(
    () =>
      (feed?.hits ?? [])
        .filter((h) => h.severity !== "information")
        .sort((a, b) => b.year - a.year || b.issue - a.issue)
        .slice(0, 3),
    [feed],
  );

  return (
    <div className="home">
      <header className="home-head">
        <p className="home-date">{today}</p>
        <h1>
          {hello}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="home-sub">
          {cloud.current ? (
            <>
              <strong>{cloud.current.name}</strong>
              {readOnly ? <span className="pill pill-muted">Lecture seule</span> : null}
            </>
          ) : (
            "Mode local : vos registres restent dans ce navigateur."
          )}
        </p>
      </header>

      <OffreBanner />

      {!registres.length ? (
        <section className="card home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-art" aria-hidden="true">
            <Icon name="shield" size={28} />
          </div>
          <h2 id="home-hero-title">Commencez par un établissement</h2>
          <p>
            Classez un site selon la nomenclature pour obtenir sa catégorie, son étude ANPE et les textes qui s’y appliquent — ou ouvrez
            directement le registre d’une entreprise que la nomenclature ne classe pas (BTP, industrie, services).
          </p>
          <div className="home-hero-actions">
            <button type="button" onClick={onClassify}>
              <Icon name="search" size={18} /> Classer un établissement
            </button>
            {!readOnly ? (
              <button type="button" className="secondary-button" onClick={onNewRegistre}>
                <Icon name="plus" size={18} /> Registre sans classement
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="home-stats" aria-label="À traiter">
          <button type="button" className="stat" onClick={onRegistres}>
            <strong>{registres.length}</strong>
            <span>{registres.length > 1 ? "établissements" : "établissement"}</span>
          </button>
          <button type="button" className={`stat${total("retard") ? " is-bad" : ""}`} onClick={onRegistres}>
            <strong>{total("retard")}</strong>
            <span>en retard</span>
          </button>
          <button type="button" className={`stat${total("aFaire") ? " is-warn" : ""}`} onClick={onRegistres}>
            <strong>{total("aFaire")}</strong>
            <span>à évaluer</span>
          </button>
          <button type="button" className={`stat${total("jort") + total("nouveaux") ? " is-accent" : ""}`} onClick={onRegistres}>
            <strong>{total("jort") + total("nouveaux")}</strong>
            <span>du JORT à examiner</span>
          </button>
        </section>
      )}

      <section className="home-actions" aria-label="Actions rapides">
        <button type="button" className="action" onClick={onClassify}>
          <span className="action-icon">
            <Icon name="search" size={20} />
          </span>
          <span>
            <strong>Classer un établissement</strong>
            <small>Nomenclature, catégorie, étude ANPE</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        {!readOnly ? (
          <button type="button" className="action" onClick={onNewRegistre}>
            <span className="action-icon">
              <Icon name="plus" size={20} />
            </span>
            <span>
              <strong>Nouveau registre</strong>
              <small>Sans classement : métiers et profil du site</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        ) : null}
        <button type="button" className="action" onClick={onVeille}>
          <span className="action-icon">
            <Icon name="bell" size={20} />
          </span>
          <span>
            <strong>Journal officiel</strong>
            <small>{last ? `Lu jusqu’au n° ${last[1]}/${last[0]}${lastDate ? ` · ${dateFr(lastDate)}` : ""}` : "Vérifier les nouveaux numéros"}</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </section>

      {etats.length ? (
        <section className="home-section" aria-labelledby="home-etabs">
          <div className="home-section-head">
            <h2 id="home-etabs">Établissements</h2>
            <button type="button" className="edii-link" onClick={onRegistres}>
              Tous les registres
            </button>
          </div>
          <ul className="home-list">
            {etats.map((e) => {
              const progress = e.retenus ? Math.round((e.evalues / e.retenus) * 100) : 0;
              const rate = e.conformes + e.nonConformes ? Math.round((e.conformes / (e.conformes + e.nonConformes)) * 100) : null;
              const metiers = metierLabels(e.reg.site);
              return (
                <li key={e.reg.id}>
                  <button type="button" className="card home-etab" onClick={() => onOpenRegistre(e.reg.id)}>
                    <span className="home-etab-main">
                      <strong>{e.reg.nom || "Sans nom"}</strong>
                      <small>
                        {e.reg.classe === null && !e.reg.activites.length ? "Sans classement" : categoryLabel(e.reg.classe)}
                        {metiers.length ? ` · ${metiers.slice(0, 2).join(", ")}${metiers.length > 2 ? "…" : ""}` : ""}
                        {` · ${plural(e.retenus, "texte")}`}
                      </small>
                      <span className="home-progress" role="img" aria-label={`${progress} % évalué`}>
                        <span style={{ width: `${progress}%` }} />
                      </span>
                      <small className="home-etab-foot">
                        {progress} % évalué{rate !== null ? ` · ${rate} % conforme` : ""} · mis à jour le {dateFr(e.reg.maj.slice(0, 10))}
                      </small>
                    </span>
                    <span className="home-etab-side">
                      {e.retard ? <span className="pill pill-bad">{plural(e.retard, "retard")}</span> : null}
                      {e.aFaire ? <span className="pill pill-warn">{e.aFaire} à évaluer</span> : null}
                      {e.nonConformes ? <span className="pill pill-bad">{e.nonConformes} NC</span> : null}
                      {e.jort + e.nouveaux ? <span className="pill pill-accent">{e.jort + e.nouveaux} JORT</span> : null}
                      {!e.retard && !e.aFaire && !e.nonConformes && !e.jort && !e.nouveaux ? <span className="pill pill-ok">À jour</span> : null}
                      <Icon name="chevron" size={16} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="home-section" aria-labelledby="home-veille">
        <div className="home-section-head">
          <h2 id="home-veille">Veille réglementaire</h2>
          <button type="button" className="edii-link" onClick={onVeille}>
            Tout le Journal
          </button>
        </div>
        {!feed ? (
          <p className="muted small">Chargement de la veille…</p>
        ) : latest.length ? (
          <ul className="home-feed">
            {latest.map((h) => (
              <li key={h.id} className="card home-hit">
                <span className={`pill ${h.severity === "critique" ? "pill-bad" : "pill-warn"}`}>{h.severity === "critique" ? "Critique" : "Important"}</span>
                <p>{h.title}</p>
                <small>
                  JORT n° {h.issue}/{h.year}
                  {h.date ? ` · ${dateFr(h.date)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Aucun texte important relevé pour l’instant.</p>
        )}
      </section>
    </div>
  );
}
