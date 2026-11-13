"use client";
/**
 * The platform's administration (ABC Consulting): every client workspace, its offer and activity,
 * the offer changed in a sheet; and the reports on texts. Platform administrators only
 * (public.platform_admins): the database refuses the calls to anyone else, and the clients'
 * registers stay out of reach.
 */
import { Mail } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { Badge, Button, EmptyState, Notice, PageHeader, SearchInput, Segmented, Sheet, SheetSection, Stats, table, Tabs, TextArea, TextField, type Tone } from "@/app/ui";
import {
  adminSetPlan,
  adminSignalements,
  adminTraiterSignalement,
  type AdminWorkspace,
  adminWorkspaceMembers,
  adminWorkspaces,
  MOTIFS,
  ROLE_LABEL,
  type Role,
  type Signalement,
  type StatutSignalement,
  STATUTS_SIGNALEMENT,
} from "@/lib/cloud/api";
import { etatOffre, type Offre, type Plan, PLANS } from "@/lib/cloud/plans";
import { dateCourte } from "@/lib/registre/labels";
import { fold } from "@/lib/veille/watch";
import s from "../_settings/settings.module.css";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const endOfDay = (d: string) => new Date(`${d}T23:59:59`).toISOString();
const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 24 * 3600 * 1000);
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Filtre = "tous" | "essai" | "payants" | "renouveler" | "termines";
const FILTRES: [Filtre, string][] = [
  ["tous", "Tous"],
  ["essai", "En essai"],
  ["payants", "Abonnés"],
  ["renouveler", "À renouveler"],
  ["termines", "Terminés"],
];

/** Where a workspace's offer stands, as a badge. */
function statut(o: Offre): { label: string; tone: Tone } {
  const { actif, jours } = etatOffre(o);
  if (!actif) return { label: `Terminé le ${dateCourte(day(o.endsAt))}`, tone: "danger" };
  if (o.plan === "essai") return { label: `${jours} j restant${(jours ?? 0) > 1 ? "s" : ""}`, tone: "accent" };
  if (jours === null) return { label: "Sans fin", tone: "neutral" };
  if (jours <= 30) return { label: `Fin dans ${jours} j`, tone: "warning" };
  return { label: `Jusqu’au ${dateCourte(day(o.endsAt))}`, tone: "success" };
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
  const [tab, setTab] = useState<"clients" | "signalements">("clients");
  const [nouveaux, setNouveaux] = useState(0);
  useEffect(() => {
    if (isAdmin)
      adminSignalements()
        .then((l) => setNouveaux(l.filter((x) => x.statut === "nouveau").length))
        .catch(() => setNouveaux(0));
  }, [isAdmin, tab]);
  if (!isAdmin)
    return (
      <>
        <PageHeader title="Administration" />
        <Notice tone="warning" title="Cet écran est réservé aux administrateurs de la plateforme." />
      </>
    );
  return (
    <div style={{ display: "grid", gap: "var(--ui-space-5)" }}>
      <PageHeader title="Administration" description="Les espaces de vos clients, leur offre, et les signalements sur les textes." />
      <Tabs
        label="Administration"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "clients", label: "Clients" },
          { value: "signalements", label: "Signalements", count: nouveaux || undefined },
        ]}
      />
      {tab === "clients" ? <Clients /> : <Signalements onChange={setNouveaux} />}
    </div>
  );
}

function Clients() {
  const [list, setList] = useState<AdminWorkspace[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    adminWorkspaces()
      .then(setList)
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(load, [load]);
  const shown = useMemo(() => {
    const q = fold(query);
    return (list ?? []).filter((w) => matches(w, filtre) && (!q || fold(`${w.name} ${w.proprietaires}`).includes(q)));
  }, [list, filtre, query]);

  if (error) return <Notice tone="danger" title={error} />;
  if (!list) return <p className={s.muted}>Chargement des espaces…</p>;
  const count = (f: Filtre) => list.filter((w) => matches(w, f)).length;
  const open = list.find((w) => w.id === openId);
  return (
    <>
      <Stats
        items={[
          { label: "Espaces clients", value: list.length, onClick: () => setFiltre("tous") },
          { label: "En essai", value: count("essai"), onClick: () => setFiltre("essai") },
          { label: "À renouveler sous 30 j", value: count("renouveler"), tone: count("renouveler") ? "warning" : undefined, onClick: () => setFiltre("renouveler") },
          { label: "Offres terminées", value: count("termines"), tone: count("termines") ? "danger" : undefined, onClick: () => setFiltre("termines") },
        ]}
      />
      <Tabs label="Filtrer" value={filtre} onChange={setFiltre} tabs={FILTRES.map(([value, label]) => ({ value, label, count: count(value) }))} />
      <SearchInput label="Rechercher un espace" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un espace, un e-mail…" />
      {!shown.length ? (
        <Notice title="Aucun espace ici." />
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} ${table.stack}`}>
            <thead>
              <tr>
                <th>Espace</th>
                <th>Offre</th>
                <th className={table.num}>Établissements</th>
                <th className={table.num}>Personnes</th>
                <th className={table.num}>Activité</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => {
                const st = statut(w.offre);
                const seats = w.membres + w.invitations;
                return (
                  <tr key={w.id} data-href="" tabIndex={0} onClick={() => setOpenId(w.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(w.id)}>
                    <td data-slot="main">
                      <span className={table.primary}>{w.name}</span>
                      <span className={table.secondary}>{w.proprietaires || "sans propriétaire"}</span>
                    </td>
                    <td data-slot="side">
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                        <Badge outline>{PLANS[w.offre.plan]?.label ?? w.offre.plan}</Badge>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </span>
                    </td>
                    <td data-slot="meta" className={table.num}>
                      {w.registres}
                      {w.offre.maxRegistres != null ? ` / ${w.offre.maxRegistres}` : ""} établ.
                    </td>
                    <td data-slot="meta" className={table.num}>
                      {seats}
                      {w.offre.maxMembres != null ? ` / ${w.offre.maxMembres}` : ""} pers.
                    </td>
                    <td data-slot="hide" className={`${table.num} ${table.muted}`}>
                      {w.activite ? dateCourte(day(w.activite)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open ? <OffreSheet key={open.id} w={open} onClose={() => setOpenId(null)} onSaved={load} /> : null}
    </>
  );
}

function OffreSheet({ w, onClose, onSaved }: { w: AdminWorkspace; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<Plan>(w.offre.plan);
  const [fin, setFin] = useState(day(w.offre.endsAt));
  const [maxRegistres, setMaxRegistres] = useState(w.offre.maxRegistres == null ? "" : String(w.offre.maxRegistres));
  const [maxMembres, setMaxMembres] = useState(w.offre.maxMembres == null ? "" : String(w.offre.maxMembres));
  const [members, setMembers] = useState<{ email: string; name: string | null; role: Role }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    adminWorkspaceMembers(w.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [w.id]);

  // Choosing an offer starts from its usual limits and length; each can then be changed.
  const choose = (p: Plan) => {
    setPlan(p);
    const d = PLANS[p];
    setMaxRegistres(d.registres == null ? "" : String(d.registres));
    setMaxMembres(d.membres == null ? "" : String(d.membres));
    setFin(d.jours == null ? "" : day(addDays(new Date(), d.jours).toISOString()));
  };
  // Extending counts from the current end when it is still to come, from today otherwise.
  const extend = (days: number) => {
    const from = fin && new Date(`${fin}T12:00:00`) > new Date() ? new Date(`${fin}T12:00:00`) : new Date();
    setFin(day(addDays(from, days).toISOString()));
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
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const st = statut(w.offre);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.name}
      description={`Créé le ${dateCourte(day(w.created))}${w.activite ? ` · dernière activité le ${dateCourte(day(w.activite))}` : ""}`}
      head={
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Badge outline>{PLANS[w.offre.plan]?.label ?? w.offre.plan}</Badge>
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          <Badge>
            {w.registres} établissement{w.registres > 1 ? "s" : ""}
          </Badge>
        </span>
      }
      footer={
        <>
          <span style={{ flex: 1, alignSelf: "center", fontSize: "var(--ui-text-xs)", color: "var(--ui-success)" }} role="status">
            {note}
          </span>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Enregistrement…" : "Enregistrer l’offre"}
          </Button>
        </>
      }
    >
      <SheetSection title="Offre">
        <Segmented<Plan> label="Offre" value={plan} onChange={choose} block options={(Object.keys(PLANS) as Plan[]).map((p) => ({ value: p, label: PLANS[p].label }))} />
        <p className={s.muted}>{PLANS[plan].note}. Les valeurs ci-dessous restent modifiables.</p>
        <div className={s.inline}>
          <TextField label="Fin de l’offre (vide : sans fin)" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          <Button onClick={() => extend(30)}>+ 30 jours</Button>
          <Button onClick={() => extend(365)}>+ 1 an</Button>
          <Button variant="ghost" onClick={() => setFin("")}>
            Sans fin
          </Button>
        </div>
        <div className={s.inline}>
          <TextField label="Établissements au plus (vide : illimité)" type="number" min={0} inputMode="numeric" value={maxRegistres} onChange={(e) => setMaxRegistres(e.target.value)} />
          <TextField label="Personnes au plus (vide : illimité)" type="number" min={0} inputMode="numeric" value={maxMembres} onChange={(e) => setMaxMembres(e.target.value)} />
        </div>
        {num(maxRegistres) != null && num(maxRegistres)! < w.registres ? (
          <Notice tone="warning" title={`L’espace a déjà ${w.registres} établissements`}>
            Ils restent, mais aucun nouveau ne pourra être créé.
          </Notice>
        ) : null}
        {error ? <Notice tone="danger" title={error} /> : null}
      </SheetSection>
      <SheetSection title={`Membres${members ? ` (${members.length})` : ""}${w.invitations ? ` · ${w.invitations} invitation${w.invitations > 1 ? "s" : ""} en attente` : ""}`}>
        {!members ? (
          <p className={s.muted}>Chargement…</p>
        ) : (
          <ul className={s.list}>
            {members.map((m) => (
              <li key={m.email} className={s.row}>
                <span className={s.who}>
                  <span className={s.name}>{m.name || m.email}</span>
                  {m.name ? <span className={s.meta}>{m.email}</span> : null}
                </span>
                <span className={s.actions}>
                  <Badge outline>{ROLE_LABEL[m.role]}</Badge>
                  <a href={`mailto:${m.email}`} aria-label={`Écrire à ${m.email}`}>
                    <Mail size={15} />
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={s.muted}>Les registres de cet espace ne vous sont visibles que si l’un de ses administrateurs vous y invite.</p>
      </SheetSection>
    </Sheet>
  );
}

/** The reports on texts, the new ones first: settled with a reply the author reads in Mon compte. */
function Signalements({ onChange }: { onChange: (nouveaux: number) => void }) {
  const [list, setList] = useState<Signalement[] | null>(null);
  const [error, setError] = useState("");
  const [filtre, setFiltre] = useState<StatutSignalement | "tous">("nouveau");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    adminSignalements()
      .then((l) => {
        setList(l);
        onChange(l.filter((x) => x.statut === "nouveau").length);
      })
      .catch((e) => setError(message(e)));
  }, [onChange]);
  useEffect(load, [load]);
  if (error) return <Notice tone="danger" title={error} />;
  if (!list) return <p className={s.muted}>Chargement des signalements…</p>;
  const shown = list.filter((x) => filtre === "tous" || x.statut === filtre);
  const settle = async (x: Signalement, statut: StatutSignalement) => {
    try {
      await adminTraiterSignalement(x.id, statut, replies[x.id] ?? x.reponse);
      load();
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <>
      <Tabs
        label="Filtrer les signalements"
        value={filtre}
        onChange={setFiltre}
        tabs={(["nouveau", "traite", "rejete", "tous"] as const).map((f) => ({
          value: f,
          label: f === "tous" ? "Tous" : STATUTS_SIGNALEMENT[f],
          count: f === "tous" ? list.length : list.filter((x) => x.statut === f).length,
        }))}
      />
      {!shown.length ? (
        <EmptyState title="Aucun signalement ici." />
      ) : (
        <ul className={s.list}>
          {shown.map((x) => (
            <li key={x.id} className={s.row} style={{ display: "grid", gap: "var(--ui-space-3)" }}>
              <span className={s.actions}>
                <Badge tone={x.statut === "nouveau" ? "warning" : x.statut === "traite" ? "success" : "neutral"} dot>
                  {STATUTS_SIGNALEMENT[x.statut]}
                </Badge>
                <Badge tone="accent">{MOTIFS[x.motif]}</Badge>
                <span className={s.meta}>{dateHeure(x.created)}</span>
              </span>
              <span className={s.who}>
                <span className={s.name} dir="auto">
                  {x.titre}
                </span>
                <span className={s.meta}>
                  {x.nom || x.email}
                  {x.nom ? ` · ${x.email}` : ""}
                  {x.espace ? ` · ${x.espace}` : ""} · {x.texteId}
                </span>
              </span>
              {x.commentaire ? <p className={s.muted}>« {x.commentaire} »</p> : null}
              <TextArea
                label="Réponse (visible par l’auteur)"
                rows={2}
                value={replies[x.id] ?? x.reponse}
                onChange={(e) => setReplies((r) => ({ ...r, [x.id]: e.target.value }))}
                placeholder="Ex. : retiré des règles de veille, merci."
              />
              <span className={s.actions}>
                <Button size="sm" variant="primary" onClick={() => void settle(x, "traite")}>
                  Traité
                </Button>
                <Button size="sm" onClick={() => void settle(x, "rejete")}>
                  Rejeté
                </Button>
                {x.statut !== "nouveau" ? (
                  <Button size="sm" variant="ghost" onClick={() => void settle(x, "nouveau")}>
                    Rouvrir
                  </Button>
                ) : null}
                {x.traite ? <span className={s.meta}>le {dateHeure(x.traite)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
