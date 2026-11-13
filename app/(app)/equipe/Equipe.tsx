"use client";
/**
 * The workspace: its members and their roles, the invitations sent, its name, other workspaces,
 * and deleting it. Supabase only (app/components/cloud.tsx).
 */
import { Copy, Mail } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { NewWorkspace, PendingInvitations, useCloud } from "@/app/components/cloud";
import { Badge, Button, Notice, PageHeader, Section, Select, SelectField, TextArea, TextField } from "@/app/ui";
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
  setMemberRole,
} from "@/lib/cloud/api";
import { limiteAtteinte } from "@/lib/cloud/plans";
import { dateFr } from "@/lib/registre/labels";
import s from "../_settings/settings.module.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

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
      if (full) throw new Error(`Limite de l’offre atteinte : ${plural(seats!, "personne")} au plus dans cet espace (membres et invitations). Contactez ABC Consulting pour l’étendre.`);
      await invite(current.id, address, role, user.id);
      setSent({ email: address, role });
      setEmail("");
      await load();
    });
  };

  const roles: Role[] = owner ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];
  const owners = list.filter((m) => m.role === "owner").length;
  const text = sent ? invitationText(current.name, sent.email, sent.role) : "";

  return (
    <div className={s.page}>
      <PageHeader title="Équipe et espace" description={`Les membres de « ${current.name} », leurs droits et les invitations.`} />
      {error ? <Notice tone="danger" title={error} /> : null}

      <Section id="membres" title="Membres" description={`${plural(list.length, "personne")} dans l’espace.`}>
        <ul className={s.list}>
          {list.map((m) => {
            const me = m.userId === user.id;
            const lastOwner = m.role === "owner" && owners === 1;
            const editable = manage && !me && (owner || m.role !== "owner");
            return (
              <li key={m.userId} className={s.row}>
                <span className={s.who}>
                  <span className={s.name}>
                    {m.name || m.email} {me ? <Badge>Vous</Badge> : null}
                  </span>
                  <span className={s.meta}>
                    {m.name ? `${m.email} · ` : ""}membre depuis le {dateFr(m.since.slice(0, 10))}
                  </span>
                </span>
                <span className={s.actions}>
                  {editable ? (
                    <Select
                      aria-label={`Rôle de ${m.email}`}
                      className={s.role}
                      value={m.role}
                      onChange={(e) => void act(() => setMemberRole(current.id, m.userId, e.target.value as Role).then(load))}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge outline>{ROLE_LABEL[m.role]}</Badge>
                  )}
                  {editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Retirer ${m.email} de « ${current.name} » ? Cette personne n’aura plus accès à ses registres.`))
                          void act(() => removeMember(current.id, m.userId).then(load));
                      }}
                    >
                      Retirer
                    </Button>
                  ) : me && !lastOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Quitter « ${current.name} » ? Vous n’aurez plus accès à ses registres.`))
                          void act(async () => {
                            await removeMember(current.id, m.userId);
                            await refresh();
                          });
                      }}
                    >
                      Quitter
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <dl className={s.roles}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r}>
              <dt>{ROLE_LABEL[r]}</dt>
              <dd>{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {manage ? (
        <Section
          id="inviter"
          title="Inviter"
          description={seats != null ? `${list.length + pending.length} / ${plural(seats, "personne")} (membres et invitations).` : "Collaborateurs de l’entreprise ou consultants."}
        >
          {!inviting ? (
            <Notice tone="warning" title="L’offre de cet espace a pris fin">
              Il est en lecture seule : les invitations sont suspendues.
            </Notice>
          ) : full ? (
            <Notice tone="warning" title={`Limite de l’offre atteinte (${plural(seats!, "personne")})`}>
              Retirez un membre ou une invitation, ou contactez ABC Consulting pour l’étendre.
            </Notice>
          ) : (
            <form className={s.inline} onSubmit={sendInvite}>
              <TextField label="Adresse e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <SelectField label="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(["admin", "editor", "viewer"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" variant="primary">
                Inviter
              </Button>
            </form>
          )}
          {sent ? (
            <>
              <Notice title={`Invitation enregistrée pour ${sent.email}`}>Envoyez-lui ce message : l’invitation l’attendra quand cette adresse se connectera.</Notice>
              <TextArea label="Message à envoyer" readOnly rows={6} value={text} className={s.message} />
              <div className={s.actions}>
                <Button size="sm" onClick={() => void navigator.clipboard?.writeText(text)}>
                  <Copy size={14} /> Copier le message
                </Button>
                <a
                  href={`mailto:${sent.email}?subject=${encodeURIComponent(`Invitation : ${current.name} sur ABClassement`)}&body=${encodeURIComponent(text)}`}
                  className={s.muted}
                >
                  <Mail size={14} style={{ verticalAlign: "-2px" }} /> Ouvrir dans ma messagerie
                </a>
              </div>
            </>
          ) : null}
          {pending.length ? (
            <ul className={s.list} aria-label="Invitations en attente">
              {pending.map((i) => (
                <li key={i.id} className={s.row}>
                  <span className={s.who}>
                    <span className={s.name}>{i.email}</span>
                    <span className={s.meta}>Invitation envoyée le {dateFr(i.created.slice(0, 10))}</span>
                  </span>
                  <span className={s.actions}>
                    <Badge outline>{ROLE_LABEL[i.role]}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => void act(() => cancelInvitation(i.id).then(load))}>
                      Annuler
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}

      {manage ? (
        <Section id="nom" title="Nom de l’espace" description="Le nom de l’entreprise, tel que ses membres le voient.">
          <form
            className={s.inline}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== current.name) void act(() => renameWorkspace(current.id, name.trim()).then(() => refresh()));
            }}
          >
            <TextField label="Nom de l’entreprise" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            <Button type="submit" disabled={!name.trim() || name.trim() === current.name}>
              Renommer
            </Button>
          </form>
        </Section>
      ) : null}

      <Section id="nouvel-espace" title="Autres espaces" description="Un espace par entreprise cliente : chacun a ses propres registres et ses propres membres.">
        <PendingInvitations onJoined={(id) => void refresh(id)} />
        <NewWorkspace compact onCreated={(id) => void refresh(id)} />
      </Section>

      {owner ? (
        <Section
          id="supprimer"
          danger
          title="Supprimer l’espace"
          description="Tous ses registres sont supprimés définitivement, pour tous ses membres. Exportez-les d’abord si besoin."
        >
          <div className={s.inline}>
            <TextField label="Tapez le nom de l’espace pour confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={current.name} />
            <Button
              variant="danger"
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
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
