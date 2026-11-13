"use client";
/**
 * The platform's administration (ABC Consulting): every client workspace, its offer and activity,
 * and the offer changed in a sheet. Platform administrators only (supabase: public.platform_admins);
 * the database refuses the calls to anyone else. The clients' registers stay out of reach.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { Icon } from "@/app/components/icons";
import { type AdminWorkspace, adminSetPlan, adminWorkspaceMembers, adminWorkspaces, ROLE_LABEL, type Role } from "@/lib/cloud/api";
import { etatOffre, type Offre, type Plan, PLANS } from "@/lib/cloud/plans";
import { fold } from "@/lib/veille/watch";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const endOfDay = (day: string) => new Date(`${day}T23:59:59`).toISOString();
const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 24 * 3600 * 1000);

type Filtre = "tous" | "essai" | "payants" | "renouveler" | "termines";
const FILTRES: [Filtre, string][] = [
  ["tous", "Tous"],
  ["essai", "En essai"],
  ["payants", "Abonnés"],
  ["renouveler", "À renouveler"],
  ["termines", "Terminés"],
];

/** Where a workspace stands, for the list: its pill's text and color. */
function statut(o: Offre): { label: string; tone: "ok" | "warn" | "bad" | "muted" | "accent" } {
  const { actif, jours } = etatOffre(o);
  if (!actif) return { label: `Terminé le ${dateFr(o.endsAt!)}`, tone: "bad" };
  if (o.plan === "essai") return { label: `${jours} j restant${(jours ?? 0) > 1 ? "s" : ""}`, tone: "accent" };
  if (jours === null) return { label: "Sans fin", tone: "muted" };
  if (jours <= 30) return { label: `Fin dans ${jours} j`, tone: "warn" };
  return { label: `Jusqu’au ${dateFr(o.endsAt!)}`, tone: "ok" };
}

const matches = (w: AdminWorkspace, f: Filtre) => {
  const { actif, jours } = etatOffre(w.offre);
  if (f === "essai") return actif && w.offre.plan === "essai";
  if (f === "payants") return actif && (w.offre.plan === "standard" || w.offre.plan === "pro");
  if (f === "renouveler") return actif && w.offre.plan !== "essai" && jours !== null && jours <= 30;
  if (f === "termines") return !actif;
  return true;
};

export function Admin() {
  const { isAdmin } = useCloud();
  const [list, setList] = useState<AdminWorkspace[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    adminWorkspaces()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const shown = useMemo(() => {
    const q = fold(query);
    return (list ?? []).filter((w) => matches(w, filtre) && (!q || fold(`${w.name} ${w.proprietaires}`).includes(q)));
  }, [list, filtre, query]);

  if (!isAdmin) return <p className="card registre-empty">Cet écran est réservé aux administrateurs de la plateforme.</p>;
  if (error)
    return (
      <p className="registre-warning" role="alert">
        {error}
      </p>
    );
  if (!list)
    return (
      <p className="muted" role="status">
        Chargement des espaces…
      </p>
    );

  const count = (f: Filtre) => list.filter((w) => matches(w, f)).length;
  const open = list.find((w) => w.id === openId);
  return (
    <div className="admin">
      <section className="home-stats" aria-label="Vue d’ensemble">
        <button type="button" className="stat" onClick={() => setFiltre("tous")}>
          <strong>{list.length}</strong>
          <span>espaces clients</span>
        </button>
        <button type="button" className="stat is-accent" onClick={() => setFiltre("essai")}>
          <strong>{count("essai")}</strong>
          <span>en essai</span>
        </button>
        <button type="button" className={`stat${count("renouveler") ? " is-warn" : ""}`} onClick={() => setFiltre("renouveler")}>
          <strong>{count("renouveler")}</strong>
          <span>à renouveler sous 30 j</span>
        </button>
        <button type="button" className={`stat${count("termines") ? " is-bad" : ""}`} onClick={() => setFiltre("termines")}>
          <strong>{count("termines")}</strong>
          <span>offres terminées</span>
        </button>
      </section>

      <div className="chips" role="tablist" aria-label="Filtrer">
        {FILTRES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filtre === id} className={filtre === id ? "chip active" : "chip"} onClick={() => setFiltre(id)}>
            {label}
            <span className="chip-count">{count(id)}</span>
          </button>
        ))}
      </div>
      <label className="registre-search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un espace, un e-mail…" aria-label="Rechercher un espace" />
      </label>

      <ul className="admin-list">
        {shown.map((w) => {
          const s = statut(w.offre);
          const seats = w.membres + w.invitations;
          return (
            <li key={w.id}>
              <button type="button" className="card admin-row" onClick={() => setOpenId(w.id)}>
                <span className="admin-row-main">
                  <strong>{w.name}</strong>
                  <small>{w.proprietaires || "sans propriétaire"}</small>
                  <small className="admin-row-counts">
                    {w.registres}
                    {w.offre.maxRegistres != null ? `/${w.offre.maxRegistres}` : ""} établissement{w.registres > 1 ? "s" : ""} · {seats}
                    {w.offre.maxMembres != null ? `/${w.offre.maxMembres}` : ""} personne{seats > 1 ? "s" : ""}
                    {w.activite ? ` · activité le ${dateFr(w.activite)}` : ""}
                  </small>
                </span>
                <span className="admin-row-side">
                  <span className="pill pill-muted">{PLANS[w.offre.plan]?.label ?? w.offre.plan}</span>
                  <span className={`pill pill-${s.tone}`}>{s.label}</span>
                  <Icon name="chevron" size={16} />
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length ? <li className="card registre-empty">Aucun espace ici.</li> : null}
      </ul>

      {open ? (
        <AdminSheet
          key={open.id}
          w={open}
          onClose={() => setOpenId(null)}
          onSaved={() => {
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function AdminSheet({ w, onClose, onSaved }: { w: AdminWorkspace; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<Plan>(w.offre.plan);
  const [fin, setFin] = useState(dayOf(w.offre.endsAt));
  const [maxRegistres, setMaxRegistres] = useState(w.offre.maxRegistres == null ? "" : String(w.offre.maxRegistres));
  const [maxMembres, setMaxMembres] = useState(w.offre.maxMembres == null ? "" : String(w.offre.maxMembres));
  const [members, setMembers] = useState<{ email: string; name: string | null; role: Role }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminWorkspaceMembers(w.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [w.id]);
  useEffect(() => {
    document.body.classList.add("has-panel");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    panel.current?.focus();
    return () => {
      document.body.classList.remove("has-panel");
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  // Choosing an offer starts from its usual limits and length; each can then be changed.
  const choose = (p: Plan) => {
    setPlan(p);
    const d = PLANS[p];
    setMaxRegistres(d.registres == null ? "" : String(d.registres));
    setMaxMembres(d.membres == null ? "" : String(d.membres));
    setFin(d.jours == null ? "" : dayOf(addDays(new Date(), d.jours).toISOString()));
  };
  // Extending counts from the current end when it is still to come, from today otherwise.
  const extend = (days: number) => {
    const from = fin && new Date(`${fin}T12:00:00`) > new Date() ? new Date(`${fin}T12:00:00`) : new Date();
    setFin(dayOf(addDays(from, days).toISOString()));
  };
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));

  const save = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await adminSetPlan(w.id, { plan, endsAt: fin ? endOfDay(fin) : null, maxRegistres: num(maxRegistres), maxMembres: num(maxMembres) });
      setNote("Offre enregistrée. Les membres la voient à leur prochaine ouverture de l’espace.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const s = statut(w.offre);
  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={w.name} ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="sheet-handle" aria-hidden="true" />
          <button type="button" className="panel-close" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
          <h2>{w.name}</h2>
          <p className="muted small">
            Créé le {dateFr(w.created)}
            {w.activite ? ` · dernière activité le ${dateFr(w.activite)}` : ""}
          </p>
          <div className="panel-status">
            <span className="pill pill-muted">{PLANS[w.offre.plan]?.label ?? w.offre.plan}</span>
            <span className={`pill pill-${s.tone}`}>{s.label}</span>
            <span className="pill pill-muted">
              {w.registres} établissement{w.registres > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="panel-body">
          <section className="panel-section panel-eval" aria-labelledby="offre-title">
            <h3 id="offre-title">Offre</h3>
            <div className="segmented segmented-4" role="radiogroup" aria-label="Offre">
              {(Object.keys(PLANS) as Plan[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={plan === p} className={`seg${plan === p ? " active" : ""}`} onClick={() => choose(p)}>
                  {PLANS[p].label}
                </button>
              ))}
            </div>
            <p className="muted small">{PLANS[plan].note}. Les valeurs ci-dessous restent modifiables.</p>
            <label>
              <span>Fin de l’offre (vide : sans fin)</span>
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
            </label>
            <div className="evidence-actions">
              <button type="button" className="secondary-button" onClick={() => extend(30)}>
                + 30 jours
              </button>
              <button type="button" className="secondary-button" onClick={() => extend(365)}>
                + 1 an
              </button>
              <button type="button" className="secondary-button" onClick={() => setFin("")}>
                Sans fin
              </button>
            </div>
            <div className="panel-grid">
              <label>
                <span>Établissements au plus (vide : illimité)</span>
                <input type="number" min={0} inputMode="numeric" value={maxRegistres} onChange={(e) => setMaxRegistres(e.target.value)} />
              </label>
              <label>
                <span>Personnes au plus (vide : illimité)</span>
                <input type="number" min={0} inputMode="numeric" value={maxMembres} onChange={(e) => setMaxMembres(e.target.value)} />
              </label>
            </div>
            {num(maxRegistres) != null && num(maxRegistres)! < w.registres ? (
              <p className="registre-warning small">
                L’espace a déjà {w.registres} établissements : ils restent, mais aucun nouveau ne pourra être créé.
              </p>
            ) : null}
            {error ? (
              <p className="registre-warning" role="alert">
                {error}
              </p>
            ) : null}
            <button type="button" className="panel-record" disabled={busy} onClick={save}>
              {busy ? "Enregistrement…" : "Enregistrer l’offre"}
            </button>
            {note ? (
              <p className="auth-done" role="status">
                {note}
              </p>
            ) : null}
          </section>
          <section className="panel-section" aria-labelledby="membres-title">
            <h3 id="membres-title">
              Membres{members ? ` (${members.length})` : ""}
              {w.invitations ? ` · ${w.invitations} invitation${w.invitations > 1 ? "s" : ""} en attente` : ""}
            </h3>
            {!members ? (
              <p className="muted small">Chargement…</p>
            ) : (
              <ul className="equipe-list">
                {members.map((m) => (
                  <li key={m.email}>
                    <span className="equipe-who">
                      <strong>{m.name || m.email}</strong>
                      {m.name ? <span className="muted small">{m.email}</span> : null}
                    </span>
                    <span className="equipe-role">{ROLE_LABEL[m.role]}</span>
                    <a className="edii-link" href={`mailto:${m.email}`}>
                      Écrire
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">Les registres de cet espace ne vous sont visibles que si l’un de ses administrateurs vous y invite.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
