"use client";
/**
 * Accounts and client workspaces (Supabase): the sign-in screens, the choice of a workspace, and
 * its registers kept in the database (lib/cloud). Without Supabase configured (lib/cloud/client.ts),
 * the app runs as before and everything stays in the browser.
 */
import type { User } from "@supabase/supabase-js";
import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  acceptInvitation,
  canEdit,
  cancelInvitation,
  createWorkspace,
  deleteRegistres,
  fetchRegistres,
  type MyInvitation,
  myInvitations,
  myName,
  myWorkspaces,
  ROLE_LABEL,
  upsertRegistres,
  type Workspace,
} from "@/lib/cloud/api";
import { cloud, cloudConfigError, cloudEnabled } from "@/lib/cloud/client";
import { type CloudBackend, cloudBackend, type SyncState } from "@/lib/cloud/sync";
import { clearLocalRegistres, localRegistres, loadRegistres, type Registre, RELOADED, saveRegistres, setRegistreBackend } from "@/lib/registre/registre";

const CURRENT = "abclassement-espace"; // the workspace last opened in this browser

export interface Cloud {
  enabled: boolean;
  user: User | null;
  name: string | null;
  workspaces: Workspace[];
  current: Workspace | null;
  sync: SyncState;
  switchTo(id: string): Promise<void>;
  /** Read the workspaces again (after creating, renaming, leaving one). */
  refresh(open?: string): Promise<void>;
  setName(name: string | null): void;
  signOut(): Promise<void>;
}

const LOCAL: Cloud = {
  enabled: false,
  user: null,
  name: null,
  workspaces: [],
  current: null,
  sync: { state: "saved" },
  switchTo: async () => {},
  refresh: async () => {},
  setName: () => {},
  signOut: async () => {},
};
const CloudContext = createContext<Cloud>(LOCAL);
export const useCloud = () => useContext(CloudContext);

/** Supabase's messages, in French. */
function frenchError(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Adresse pas encore confirmée : ouvrez le lien reçu par e-mail.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (/password should be at least|weak password/i.test(m)) return "Mot de passe trop court ou trop simple : 8 caractères au moins, avec des lettres et des chiffres.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives : réessayez dans quelques minutes.";
  if (/same password|different from the old/i.test(m)) return "Choisissez un mot de passe différent de l’ancien.";
  if (/failed to fetch|network/i.test(m)) return "Le serveur ne répond pas : vérifiez la connexion Internet.";
  return m;
}

const byDate = (list: Registre[]) => [...list].sort((a, b) => (a.cree ?? "").localeCompare(b.cree ?? "") || a.id.localeCompare(b.id));

/**
 * The app behind its sign-in: the account, then a workspace, then the app with that workspace's
 * registers. In local mode, the app as it is.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  if (cloudConfigError)
    return (
      <CenteredCard title="Configuration à corriger">
        <p className="registre-warning" role="alert">
          {cloudConfigError}
        </p>
        <p className="muted small">
          Corrigez le fichier .env.local (en local) ou les variables d’environnement du site (Vercel), puis redémarrez l’application (npm run dev) ou
          redéployez.
        </p>
      </CenteredCard>
    );
  if (!cloudEnabled) return <CloudContext.Provider value={LOCAL}>{children}</CloudContext.Provider>;
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const c = cloud()!;
    c.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = c.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      // Same account (token refreshed): keep the object, so that nothing reloads.
      setUser((u) => (u && session?.user && u.id === session.user.id ? u : (session?.user ?? null)));
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (user === undefined) return <Splash />;
  if (recovery && user) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!user) return <AuthScreen />;
  return (
    <Workspaces key={user.id} user={user}>
      {children}
    </Workspaces>
  );
}

function Workspaces({ user, children }: { user: User; children: ReactNode }) {
  const [list, setList] = useState<Workspace[] | null>(null);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // the current workspace's registers are loaded
  const [error, setError] = useState("");
  const [sync, setSync] = useState<SyncState>({ state: "saved" });
  const backend = useRef<CloudBackend | null>(null);

  const open = useCallback(async (w: Workspace | null) => {
    if (backend.current) {
      await backend.current.flush();
      backend.current.dispose();
      backend.current = null;
    }
    setReady(false);
    setCurrent(w);
    if (!w) {
      setRegistreBackend(null);
      return;
    }
    try {
      localStorage.setItem(CURRENT, w.id);
    } catch {
      // remembered next time only
    }
    const registres = byDate(await fetchRegistres(w.id));
    const b = cloudBackend(
      registres,
      { upsert: (l) => upsertRegistres(w.id, l), remove: (ids) => deleteRegistres(w.id, ids) },
      { readOnly: !canEdit(w.role), onState: setSync, delay: 1500 },
    );
    backend.current = b;
    setSync({ state: canEdit(w.role) ? "saved" : "readonly" });
    setRegistreBackend(b);
    setReady(true);
  }, []);

  const refresh = useCallback(
    async (want?: string) => {
      setError("");
      try {
        const [ws, n] = await Promise.all([myWorkspaces(user.id), myName(user.id)]);
        setList(ws);
        setName(n);
        let remembered: string | null = null;
        try {
          remembered = localStorage.getItem(CURRENT);
        } catch {
          remembered = null;
        }
        const next = ws.find((w) => w.id === want) ?? ws.find((w) => w.id === (current?.id ?? remembered)) ?? ws[0] ?? null;
        if (next?.id !== current?.id || !ready) await open(next);
        else setCurrent(next); // same workspace: its name or the role may have changed
      } catch (e) {
        setError(frenchError(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, current?.id, ready, open],
  );

  useEffect(() => {
    void refresh();
    return () => {
      backend.current?.dispose();
      setRegistreBackend(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A colleague's changes: read again when the page comes back to the front, unless ours wait.
  useEffect(() => {
    if (!current || !ready) return;
    const reread = async () => {
      const b = backend.current;
      if (!b || b.pending() || document.visibilityState !== "visible") return;
      try {
        const fresh = byDate(await fetchRegistres(current.id));
        if (b !== backend.current || b.pending()) return;
        if (JSON.stringify(fresh) !== JSON.stringify(byDate(b.list))) {
          b.list = fresh;
          setRegistreBackend(b);
        }
      } catch {
        // offline: the next return will try again
      }
    };
    document.addEventListener("visibilitychange", reread);
    window.addEventListener("focus", reread);
    return () => {
      document.removeEventListener("visibilitychange", reread);
      window.removeEventListener("focus", reread);
    };
  }, [current, ready]);

  // Leaving with changes not sent yet: the browser asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (backend.current?.pending()) {
        void backend.current.flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const signOut = useCallback(async () => {
    await backend.current?.flush();
    backend.current?.dispose();
    backend.current = null;
    setRegistreBackend(null);
    await cloud()!.auth.signOut();
  }, []);

  const value: Cloud = {
    enabled: true,
    user,
    name,
    workspaces: list ?? [],
    current,
    sync,
    switchTo: async (id) => {
      const w = list?.find((x) => x.id === id);
      if (!w || w.id === current?.id) return;
      try {
        await open(w);
      } catch (e) {
        setError(frenchError(e));
        await open(current).catch(() => {});
      }
    },
    refresh,
    setName,
    signOut,
  };

  if (error && !list)
    return (
      <CenteredCard title="Connexion au serveur impossible">
        <p className="registre-warning">{error}</p>
        <div className="registre-actions">
          <button type="button" className="primary-button" onClick={() => void refresh()}>
            Réessayer
          </button>
          <button type="button" className="secondary-button" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </CenteredCard>
    );
  if (!list) return <Splash />;
  if (!list.length)
    return (
      <CloudContext.Provider value={value}>
        <Onboarding />
      </CloudContext.Provider>
    );
  if (!ready) return <Splash label={current ? `Ouverture de « ${current.name} »…` : undefined} />;
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

function Splash({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="auth-page">
      <p className="muted" role="status">
        {label}
      </p>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span>ABC</span>lassement<span className="brand-period">.</span>
    </span>
  );
}

function CenteredCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Wordmark />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Sign in, create an account, or ask for a new password. */
function AuthScreen() {
  const [mode, setMode] = useState<"connexion" | "inscription" | "oubli">("connexion");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    const auth = cloud()!.auth;
    try {
      if (mode === "connexion") {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "inscription") {
        if (password.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session)
          setDone(`Un e-mail de confirmation a été envoyé à ${email.trim()}. Ouvrez le lien qu’il contient pour activer votre compte, puis connectez-vous.`);
      } else {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setDone(`Si un compte existe pour ${email.trim()}, un e-mail avec un lien pour choisir un nouveau mot de passe vient d’être envoyé.`);
      }
    } catch (err) {
      setError(frenchError(err));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "connexion" ? "Connexion" : mode === "inscription" ? "Créer un compte" : "Mot de passe oublié";
  return (
    <div className="auth-page">
      <section className="auth-pitch" aria-label="ABClassement">
        <Wordmark />
        <p className="auth-lead">Classement des établissements, registres réglementaires et veille du Journal officiel, pour vos sites en Tunisie.</p>
        <ul>
          <li>Classement EDII et étude environnementale ANPE de chaque site</li>
          <li>Registre des exigences réglementaires par établissement, prêt pour l’audit</li>
          <li>Veille du JORT : les nouveaux textes qui concernent vos sites</li>
          <li>Un espace privé par entreprise, partagé avec votre équipe et vos consultants</li>
        </ul>
        <img src="/brand/abc-consulting.jpg" alt="ABC Consulting" width="763" height="366" className="auth-logo" />
      </section>
      <div className="auth-card card">
        <h1>{title}</h1>
        {done ? (
          <p className="auth-done" role="status">
            {done}
          </p>
        ) : null}
        <form onSubmit={submit} className="auth-form">
          {mode === "inscription" ? (
            <label>
              <span>Nom et prénom</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            </label>
          ) : null}
          <label>
            <span>Adresse e-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          {mode !== "oubli" ? (
            <label>
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "connexion" ? "current-password" : "new-password"}
                minLength={mode === "inscription" ? 8 : undefined}
                required
              />
            </label>
          ) : null}
          {error ? (
            <p className="registre-warning" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Un instant…" : mode === "connexion" ? "Se connecter" : mode === "inscription" ? "Créer mon compte" : "Recevoir un lien"}
          </button>
        </form>
        <div className="auth-switch">
          {mode !== "connexion" ? (
            <button type="button" className="edii-link" onClick={() => setMode("connexion")}>
              J’ai déjà un compte : me connecter
            </button>
          ) : (
            <>
              <button type="button" className="edii-link" onClick={() => setMode("inscription")}>
                Créer un compte
              </button>
              <button type="button" className="edii-link" onClick={() => setMode("oubli")}>
                Mot de passe oublié ?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** After the link of a "mot de passe oublié" e-mail. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (password.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
      const { error } = await cloud()!.auth.updateUser({ password });
      if (error) throw error;
      onDone();
    } catch (err) {
      setError(frenchError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <CenteredCard title="Nouveau mot de passe">
      <form onSubmit={submit} className="auth-form">
        <label>
          <span>Nouveau mot de passe (8 caractères au moins)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        {error ? (
          <p className="registre-warning" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary-button" disabled={busy}>
          Enregistrer
        </button>
      </form>
    </CenteredCard>
  );
}

/** Invitations waiting for this account, to accept or decline. */
export function PendingInvitations({ onJoined }: { onJoined: (workspace: string) => void }) {
  const [list, setList] = useState<MyInvitation[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    myInvitations()
      .then(setList)
      .catch((e) => setError(frenchError(e)));
  }, []);
  useEffect(load, [load]);
  if (!list.length && !error) return null;
  return (
    <div className="invitations-pending">
      <h2>Invitations reçues</h2>
      {error ? <p className="registre-warning">{error}</p> : null}
      <ul>
        {list.map((i) => (
          <li key={i.id}>
            <span>
              <strong>{i.workspaceName}</strong> · {ROLE_LABEL[i.role]}
              {i.invitedBy ? <span className="muted"> · invité par {i.invitedBy}</span> : null}
            </span>
            <span className="registre-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  acceptInvitation(i.id)
                    .then(onJoined)
                    .catch((e) => setError(frenchError(e)))
                }
              >
                Rejoindre
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  cancelInvitation(i.id)
                    .then(load)
                    .catch((e) => setError(frenchError(e)))
                }
              >
                Refuser
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A new workspace: one per client company. */
export function NewWorkspace({ onCreated, compact }: { onCreated: (id: string) => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      onCreated(await createWorkspace(name.trim()));
      setName("");
    } catch (err) {
      setError(frenchError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={compact ? "workspace-new is-compact" : "workspace-new auth-form"}>
      <label>
        <span>Nom de l’entreprise</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Société industrielle de Sfax" maxLength={120} required />
      </label>
      {error ? (
        <p className="registre-warning" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary-button" disabled={busy || !name.trim()}>
        Créer l’espace de travail
      </button>
    </form>
  );
}

/** A signed-in account without a workspace: accept an invitation, or create one. */
function Onboarding() {
  const { user, refresh, signOut } = useCloud();
  return (
    <div className="auth-page">
      <div className="auth-card card is-wide">
        <Wordmark />
        <h1>Bienvenue{user?.email ? `, ${user.email}` : ""}</h1>
        <p className="muted">
          Chaque entreprise a son espace de travail privé : ses établissements, leurs registres et leur veille. Créez celui de votre entreprise, ou rejoignez
          celui auquel vous avez été invité.
        </p>
        <PendingInvitations onJoined={(id) => void refresh(id)} />
        <h2>Créer un espace de travail</h2>
        <NewWorkspace onCreated={(id) => void refresh(id)} />
        <div className="auth-switch">
          <button type="button" className="edii-link" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

const SYNC_LABEL: Record<SyncState["state"], string> = {
  saved: "Enregistré",
  saving: "Enregistrement…",
  error: "Non enregistré : nouvel essai…",
  readonly: "Lecture seule",
};

/** The workspace open, to switch to another, and whether its registers are saved. */
export function WorkspaceSwitcher({ onManage }: { onManage: () => void }) {
  const { workspaces, current, switchTo, sync } = useCloud();
  if (!current) return null;
  return (
    <div className="workspace-switcher">
      <label>
        <span className="eyebrow">Espace de travail</span>
        {workspaces.length > 1 ? (
          <select value={current.id} onChange={(e) => void switchTo(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        ) : (
          <strong className="workspace-name">{current.name}</strong>
        )}
      </label>
      <div className="workspace-meta">
        <span>{ROLE_LABEL[current.role]}</span>
        <span className={`sync-state is-${sync.state}`} title={sync.message} role="status">
          {SYNC_LABEL[sync.state]}
        </span>
      </div>
      <button type="button" className="edii-link" onClick={onManage}>
        Gérer l’espace et l’équipe
      </button>
    </div>
  );
}

/** A reader opens the registers: what they change on screen is not saved. */
export function ReadOnlyNotice() {
  const { current } = useCloud();
  if (!current || canEdit(current.role)) return null;
  return (
    <p className="registre-warning" role="note">
      Vous êtes lecteur de « {current.name} » : vous pouvez consulter et exporter les registres, mais vos modifications ne sont pas enregistrées. Un
      administrateur de l’espace peut vous donner le rôle d’éditeur.
    </p>
  );
}

/** Registers made in this browser before accounts: brought into the workspace on request. */
export function LocalImport() {
  const { enabled, current } = useCloud();
  const [local, setLocal] = useState<Registre[]>([]);
  const [done, setDone] = useState("");
  useEffect(() => {
    if (enabled) setLocal(localRegistres());
  }, [enabled, current?.id]);
  if (!enabled || !current || (!local.length && !done)) return null;
  if (done) return <p className="auth-done">{done}</p>;
  if (!canEdit(current.role)) return null;
  const importAll = () => {
    const here = loadRegistres();
    const ids = new Set(here.map((r) => r.id));
    const added = local.filter((r) => !ids.has(r.id));
    saveRegistres([...here, ...added]);
    window.dispatchEvent(new Event(RELOADED));
    clearLocalRegistres();
    setLocal([]);
    setDone(`${added.length} registre${added.length > 1 ? "s" : ""} importé${added.length > 1 ? "s" : ""} dans « ${current.name} ».`);
  };
  return (
    <div className="registre-existing local-import">
      <p>
        <strong>
          {local.length} registre{local.length > 1 ? "s" : ""} enregistré{local.length > 1 ? "s" : ""} dans ce navigateur
        </strong>{" "}
        avant la création des comptes : {local.map((r) => r.nom || "sans nom").join(", ")}.
      </p>
      <div className="registre-actions">
        <button type="button" className="primary-button" onClick={importAll}>
          Importer dans « {current.name} »
        </button>
        <button type="button" className="secondary-button" onClick={() => setLocal([])}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
