"use client";
/**
 * The workspace's page: its members and their roles, the invitations sent, its name, and leaving or
 * deleting it. And the account's page: name, password. Supabase only (app/components/cloud.tsx).
 */
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { NewWorkspace, PendingInvitations, useCloud } from "@/app/components/cloud";
import { ThemeChoice } from "@/app/components/theme";
import {
  canInvite,
  canManage,
  cancelInvitation,
  deleteWorkspace,
  type Invitation,
  invitations,
  invite,
  type Member,
  members,
  removeMember,
  renameWorkspace,
  ROLE_HELP,
  ROLE_LABEL,
  type Role,
  mesSignalements,
  MOTIFS,
  myNotifications,
  setMemberRole,
  setMyNotifications,
  type Signalement,
  STATUTS_SIGNALEMENT,
  updateMyName,
} from "@/lib/cloud/api";
import { cloud } from "@/lib/cloud/client";
import { limiteAtteinte } from "@/lib/cloud/plans";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What to send to someone invited: the database sends no e-mail itself. */
function invitationText(workspace: string, email: string, role: Role): string {
  const url = typeof window !== "undefined" ? window.location.origin : "";
  return (
    `Bonjour,\n\nVous êtes invité(e) à rejoindre l’espace de travail « ${workspace} » sur ABClassement, en tant que ${ROLE_LABEL[role].toLowerCase()}.\n\n` +
    `Ouvrez ${url} et créez votre compte (ou connectez-vous) avec l’adresse ${email} : l’invitation vous y attendra.\n`
  );
}

export function Equipe() {
  const { user, current, refresh } = useCloud();
  const [list, setList] = useState<Member[]>([]);
  const [pending, setPending] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ email: string; role: Role } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [name, setName] = useState(current?.name ?? "");
  const [confirm, setConfirm] = useState("");
  const manage = canManage(current?.role);
  const inviting = canInvite(current); // and the offer has not ended
  const seats = current?.offre?.maxMembres ?? null;
  const full = limiteAtteinte(seats, list.length + pending.length);
  const owner = current?.role === "owner";

  const load = useCallback(async () => {
    if (!current) return;
    try {
      setList(await members(current.id));
      setPending(canManage(current.role) ? await invitations(current.id) : []);
    } catch (e) {
      setError(message(e));
    }
  }, [current]);
  useEffect(() => {
    void load();
    setName(current?.name ?? "");
  }, [load, current?.name]);

  if (!current || !user) return null;
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    }
  };

  const sendInvite = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    void act(async () => {
      if (list.some((m) => m.email === address)) throw new Error("Cette personne est déjà membre de l’espace.");
      if (full) throw new Error(`Limite de l’offre atteinte : ${seats} personne${seats! > 1 ? "s" : ""} au plus dans cet espace (membres et invitations). Contactez ABC Consulting pour l’étendre.`);
      await invite(current.id, address, role, user.id);
      setSent({ email: address, role });
      setEmail("");
      await load();
    });
  };

  const roles: Role[] = owner ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];
  const owners = list.filter((m) => m.role === "owner").length;

  return (
    <div className="equipe">
      {error ? (
        <p className="registre-warning" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card equipe-section" aria-labelledby="equipe-membres">
        <div className="section-heading">
          <h2 id="equipe-membres">Membres</h2>
          <span className="quiet-label">
            {list.length} personne{list.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="equipe-list">
          {list.map((m) => {
            const me = m.userId === user.id;
            const lastOwner = m.role === "owner" && owners === 1;
            const editable = manage && !me && (owner || m.role !== "owner");
            return (
              <li key={m.userId}>
                <span className="equipe-who">
                  <strong>{m.name || m.email}</strong>
                  {m.name ? <span className="muted">{m.email}</span> : null}
                  <span className="muted small">
                    {me ? "Vous · " : ""}membre depuis le {dateFr(m.since)}
                  </span>
                </span>
                {editable ? (
                  <select
                    aria-label={`Rôle de ${m.email}`}
                    value={m.role}
                    onChange={(e) => void act(() => setMemberRole(current.id, m.userId, e.target.value as Role).then(load))}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="equipe-role">{ROLE_LABEL[m.role]}</span>
                )}
                {editable ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (window.confirm(`Retirer ${m.email} de « ${current.name} » ? Cette personne n’aura plus accès à ses registres.`))
                        void act(() => removeMember(current.id, m.userId).then(load));
                    }}
                  >
                    Retirer
                  </button>
                ) : me && !lastOwner ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (window.confirm(`Quitter « ${current.name} » ? Vous n’aurez plus accès à ses registres.`))
                        void act(async () => {
                          await removeMember(current.id, m.userId);
                          await refresh();
                        });
                    }}
                  >
                    Quitter
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
        <details className="equipe-roles">
          <summary>Que permet chaque rôle ?</summary>
          <dl>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <div key={r}>
                <dt>{ROLE_LABEL[r]}</dt>
                <dd>{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      {manage ? (
        <section className="card equipe-section" aria-labelledby="equipe-inviter">
          <div className="section-heading">
            <h2 id="equipe-inviter">Inviter</h2>
            <span className="quiet-label">
              {seats != null ? `${list.length + pending.length} / ${seats} personnes (membres et invitations)` : "Collaborateurs de l’entreprise ou consultants"}
            </span>
          </div>
          {!inviting ? (
            <p className="registre-warning">L’offre de cet espace a pris fin : il est en lecture seule, les invitations sont suspendues.</p>
          ) : full ? (
            <p className="registre-warning">
              Limite de l’offre atteinte ({seats} personne{seats! > 1 ? "s" : ""}). Retirez un membre ou une invitation, ou contactez ABC Consulting pour l’étendre.
            </p>
          ) : null}
          <form className="equipe-invite" onSubmit={sendInvite} hidden={!inviting || full}>
            <label>
              <span>Adresse e-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span>Rôle</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(["admin", "editor", "viewer"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary-button">
              Inviter
            </button>
          </form>
          {sent ? (
            <div className="equipe-sent" role="status">
              <p>
                Invitation enregistrée pour <strong>{sent.email}</strong>. Envoyez-lui ce message : l’invitation l’attendra quand cette adresse se connectera.
              </p>
              <textarea readOnly rows={6} value={invitationText(current.name, sent.email, sent.role)} />
              <div className="registre-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void navigator.clipboard?.writeText(invitationText(current.name, sent.email, sent.role))}
                >
                  Copier le message
                </button>
                <a
                  className="secondary-button"
                  href={`mailto:${sent.email}?subject=${encodeURIComponent(`Invitation : ${current.name} sur ABClassement`)}&body=${encodeURIComponent(invitationText(current.name, sent.email, sent.role))}`}
                >
                  Ouvrir dans ma messagerie
                </a>
              </div>
            </div>
          ) : null}
          {pending.length ? (
            <>
              <h3>Invitations en attente</h3>
              <ul className="equipe-list">
                {pending.map((i) => (
                  <li key={i.id}>
                    <span className="equipe-who">
                      <strong>{i.email}</strong>
                      <span className="muted small">envoyée le {dateFr(i.created)}</span>
                    </span>
                    <span className="equipe-role">{ROLE_LABEL[i.role]}</span>
                    <button type="button" className="secondary-button" onClick={() => void act(() => cancelInvitation(i.id).then(load))}>
                      Annuler
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {manage ? (
        <section className="card equipe-section" aria-labelledby="equipe-nom">
          <h2 id="equipe-nom">Nom de l’espace</h2>
          <form
            className="equipe-invite"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== current.name) void act(() => renameWorkspace(current.id, name.trim()).then(() => refresh()));
            }}
          >
            <label>
              <span>Nom de l’entreprise</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </label>
            <button type="submit" className="secondary-button" disabled={!name.trim() || name.trim() === current.name}>
              Renommer
            </button>
          </form>
        </section>
      ) : null}

      <section className="card equipe-section" aria-labelledby="equipe-autre">
        <h2 id="equipe-autre">Autres espaces de travail</h2>
        <p className="muted small">Un espace par entreprise cliente : chacun a ses propres registres et ses propres membres.</p>
        <PendingInvitations onJoined={(id) => void refresh(id)} />
        <NewWorkspace compact onCreated={(id) => void refresh(id)} />
      </section>

      {owner ? (
        <section className="card equipe-section equipe-danger" aria-labelledby="equipe-supprimer">
          <h2 id="equipe-supprimer">Supprimer l’espace</h2>
          <p className="small">
            Tous ses registres sont supprimés définitivement, pour tous ses membres. Exportez-les d’abord si besoin. Tapez le nom de l’espace pour confirmer.
          </p>
          <div className="equipe-invite">
            <label>
              <span>Nom de l’espace</span>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={current.name} />
            </label>
            <button
              type="button"
              className="danger-button"
              disabled={confirm.trim() !== current.name}
              onClick={() =>
                void act(async () => {
                  await deleteWorkspace(current.id);
                  setConfirm("");
                  await refresh();
                })
              }
            >
              Supprimer définitivement
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The account: name shown to colleagues, password, signing out. */
export function Compte() {
  const { user, name, setName, signOut } = useCloud();
  const [fullName, setFullName] = useState(name ?? "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notify, setNotify] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Signalement[]>([]);
  useEffect(() => {
    if (user) void mesSignalements(user.id).then(setReports);
  }, [user]);
  useEffect(() => setFullName(name ?? ""), [name]);
  useEffect(() => {
    if (user) void myNotifications(user.id).then(setNotify);
  }, [user]);
  if (!user) return null;
  const act = async (fn: () => Promise<void>, done: string) => {
    setError("");
    setNote("");
    try {
      await fn();
      setNote(done);
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <div className="equipe">
      {note ? (
        <p className="auth-done" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="registre-warning" role="alert">
          {error}
        </p>
      ) : null}
      <section className="card equipe-section">
        <h2>Identité</h2>
        <p className="small">
          Connecté avec <strong>{user.email}</strong>.
        </p>
        <form
          className="equipe-invite"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await updateMyName(user.id, fullName);
              setName(fullName.trim() || null);
            }, "Nom enregistré.");
          }}
        >
          <label>
            <span>Nom et prénom (visible par vos collègues)</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </label>
          <button type="submit" className="secondary-button">
            Enregistrer
          </button>
        </form>
      </section>
      <section className="card equipe-section">
        <h2>Récapitulatif par e-mail</h2>
        <label className="toggle-row">
          <span>
            <strong>Chaque lundi</strong>
            <small className="muted">Évaluations en retard ou à venir, actions à suivre, nouveaux textes du JORT : un seul e-mail pour tous vos espaces.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={notify ?? true}
            disabled={notify === null}
            onChange={(e) => {
              const on = e.target.checked;
              setNotify(on);
              void act(() => setMyNotifications(user.id, on), on ? "Récapitulatif activé." : "Récapitulatif arrêté.");
            }}
          />
        </label>
      </section>
      <section className="card equipe-section">
        <h2>Apparence</h2>
        <ThemeChoice />
      </section>
      <section className="card equipe-section">
        <h2>Mot de passe</h2>
        <form
          className="equipe-invite"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              if (password.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
              const { error } = await cloud()!.auth.updateUser({ password });
              if (error) throw error;
              setPassword("");
            }, "Mot de passe changé.");
          }}
        >
          <label>
            <span>Nouveau mot de passe (8 caractères au moins)</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <button type="submit" className="secondary-button">
            Changer
          </button>
        </form>
      </section>
      {reports.length ? (
        <section className="card equipe-section">
          <h2>Vos signalements</h2>
          <ul className="equipe-list">
            {reports.map((r) => (
              <li key={r.id} className="signalement-mine">
                <span className="equipe-who">
                  <strong dir="auto">{r.titre}</strong>
                  <span className="muted small">
                    {MOTIFS[r.motif]} · {new Date(r.created).toLocaleDateString("fr-FR")}
                  </span>
                  {r.reponse ? <span className="small">Réponse d’ABC Consulting : {r.reponse}</span> : null}
                </span>
                <span className={`pill ${r.statut === "nouveau" ? "pill-warn" : r.statut === "traite" ? "pill-ok" : "pill-muted"}`}>{STATUTS_SIGNALEMENT[r.statut]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card equipe-section">
        <h2>Session</h2>
        <button type="button" className="secondary-button" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </section>
    </div>
  );
}
