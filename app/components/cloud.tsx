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
  canWrite,
  isPlatformAdmin,
  cancelInvitation,
  createWorkspace,
  deleteRegistres,
  fetchRegistre,
  fetchRegistres,
  type MyInvitation,
  myInvitations,
  myName,
  myWorkspaces,
  ROLE_LABEL,
  saveRegistre,
  type Workspace,
} from "@/lib/cloud/api";
import { AuthFrame, AuthScreen, AuthSection, NewPassword, Splash } from "@/app/components/auth";
import { Button, Notice, TextField } from "@/app/ui";
import { frenchError } from "@/lib/cloud/errors";
import ui from "./cloud.module.css";
import { cloud, cloudConfigError, cloudEnabled } from "@/lib/cloud/client";
import { etatOffre, PLANS } from "@/lib/cloud/plans";
import { type CloudBackend, cloudBackend, type SyncState } from "@/lib/cloud/sync";
import {
  clearLocalRegistres,
  localRegistres,
  loadRegistres,
  type Registre,
  RELOADED,
  saveRegistres,
  setRegistreBackend,
} from "@/lib/registre/registre";

const CURRENT = "abclassement-espace"; // the workspace last opened in this browser

export interface Cloud {
  enabled: boolean;
  user: User | null;
  name: string | null;
  workspaces: Workspace[];
  current: Workspace | null;
  sync: SyncState;
  isAdmin: boolean; // a platform administrator (ABC Consulting)
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
  isAdmin: false,
  switchTo: async () => {},
  refresh: async () => {},
  setName: () => {},
  signOut: async () => {},
};
const CloudContext = createContext<Cloud>(LOCAL);
export const useCloud = () => useContext(CloudContext);

/** A colleague's save reached registers shown here ("remote"), or ours was merged with one ("merged"). */
export const REMOTE_EVENT = "abclassement-registres-distants";
export type RemoteDetail = { ids: string[]; kind: "remote" | "merged" };
const announce = (ids: string[], kind: RemoteDetail["kind"]) =>
  window.dispatchEvent(new CustomEvent<RemoteDetail>(REMOTE_EVENT, { detail: { ids, kind } }));

/**
 * The app behind its sign-in: the account, then a workspace, then the app with that workspace's
 * registers. In local mode, the app as it is.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  if (cloudConfigError)
    return (
      <AuthFrame title="Configuration à corriger">
        <Notice tone="danger" title={cloudConfigError}>
          Corrigez le fichier .env.local (en local) ou les variables d’environnement du site (Vercel), puis redémarrez l’application (npm run dev) ou
          redéployez.
        </Notice>
      </AuthFrame>
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
  const [isAdmin, setIsAdmin] = useState(false);
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
    const stored = (await fetchRegistres(w.id)).sort(
      (a, b) => (a.registre.cree ?? "").localeCompare(b.registre.cree ?? "") || a.registre.id.localeCompare(b.registre.id),
    );
    const b: CloudBackend = cloudBackend(
      stored,
      {
        save: (r, expected) => saveRegistre(w.id, r, expected),
        remove: (ids) => deleteRegistres(w.id, ids),
      },
      {
        readOnly: !canWrite(w),
        onState: setSync,
        delay: 1500,
        // Merged with a colleague's changes: the page shows the merged registers.
        onMerged: (ids) => {
          setRegistreBackend(b);
          announce(ids, "merged");
        },
      },
    );
    backend.current = b;
    setSync({ state: canWrite(w) ? "saved" : "readonly" });
    setRegistreBackend(b);
    setReady(true);
  }, []);

  const refresh = useCallback(
    async (want?: string) => {
      setError("");
      try {
        const [ws, n, admin] = await Promise.all([myWorkspaces(user.id), myName(user.id), isPlatformAdmin()]);
        setList(ws);
        setName(n);
        setIsAdmin(admin);
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

  // A colleague's changes: heard live (Supabase Realtime), and read again when the page comes back
  // to the front. A register with a change of ours waiting is left alone: its save merges.
  useEffect(() => {
    if (!current || !ready) return;
    const reread = async () => {
      const b = backend.current;
      if (!b || document.visibilityState !== "visible") return;
      try {
        const fresh = await fetchRegistres(current.id);
        if (b !== backend.current) return;
        const changed = fresh.filter((s) => b.applyRemote(s)).map((s) => s.registre.id);
        const ids = new Set(fresh.map((s) => s.registre.id));
        const gone = b.list.filter((r) => !ids.has(r.id) && b.applyRemoval(r.id)).map((r) => r.id);
        if (changed.length || gone.length) {
          setRegistreBackend(b);
          announce([...changed, ...gone], "remote");
        }
      } catch {
        // offline: the next return will try again
      }
    };
    document.addEventListener("visibilitychange", reread);
    window.addEventListener("focus", reread);

    const c = cloud()!;
    const live = c
      .channel(`registres-${current.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "registres",
          filter: `organization_id=eq.${current.id}`,
        },
        (p) => void heard(p.new),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "registres",
          filter: `organization_id=eq.${current.id}`,
        },
        (p) => void heard(p.new),
      )
      // Removals cannot be filtered by workspace: an unknown id is ignored.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "registres" }, (p) => {
        const b = backend.current;
        const id = (p.old as { id?: string }).id;
        if (b && id && b.applyRemoval(id)) {
          setRegistreBackend(b);
          announce([id], "remote");
        }
      })
      .subscribe();
    async function heard(row: unknown) {
      const b = backend.current;
      const { id, version } = (row ?? {}) as { id?: string; version?: number };
      if (!b || !id || (version ?? 0) <= b.versionOf(id)) return; // our own save, or already known
      try {
        const s = await fetchRegistre(current!.id, id);
        if (s && b === backend.current && b.applyRemote(s)) {
          setRegistreBackend(b);
          announce([id], "remote");
        }
      } catch {
        // the next focus reads it
      }
    }
    return () => {
      document.removeEventListener("visibilitychange", reread);
      window.removeEventListener("focus", reread);
      void c.removeChannel(live);
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
    isAdmin,
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
      <AuthFrame title="Connexion au serveur impossible">
        <Notice tone="danger" title={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" onClick={() => void refresh()}>
            Réessayer
          </Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </div>
      </AuthFrame>
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
    <div data-ui="" className={ui.list}>
      {error ? <Notice tone="danger" title={error} /> : null}
      {list.map((i) => (
        <div key={i.id} className={ui.row}>
          <div className={ui.rowText}>
            <span className={ui.rowTitle}>{i.workspaceName}</span>
            <span className={ui.rowMeta}>
              {ROLE_LABEL[i.role]}
              {i.invitedBy ? ` · invité par ${i.invitedBy}` : ""}
            </span>
          </div>
          <div className={ui.rowActions}>
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                acceptInvitation(i.id)
                  .then(onJoined)
                  .catch((e) => setError(frenchError(e)))
              }
            >
              Rejoindre
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                cancelInvitation(i.id)
                  .then(load)
                  .catch((e) => setError(frenchError(e)))
              }
            >
              Refuser
            </Button>
          </div>
        </div>
      ))}
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
    <form data-ui="" id="nouvel-espace" onSubmit={submit} className={compact ? ui.inline : ui.form}>
      <TextField
        label="Nom de l’entreprise"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex. : Société industrielle de Sfax"
        maxLength={120}
        required
        error={error || undefined}
      />
      <Button type="submit" variant="primary" disabled={busy || !name.trim()} block={!compact}>
        Créer l’espace de travail
      </Button>
    </form>
  );
}

/** A signed-in account without a workspace: accept an invitation, or create one. */
function Onboarding() {
  const { user, refresh, signOut } = useCloud();
  return (
    <AuthFrame
      wide
      title="Bienvenue"
      lead={
        <>
          Chaque entreprise a son espace de travail privé : ses établissements, leurs registres et leur veille. Créez celui de votre entreprise, ou
          rejoignez celui auquel vous avez été invité
          {user?.email ? ` (${user.email})` : ""}.
        </>
      }
    >
      <PendingInvitations onJoined={(id) => void refresh(id)} />
      <AuthSection title="Créer un espace de travail">
        <NewWorkspace onCreated={(id) => void refresh(id)} />
      </AuthSection>
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </div>
    </AuthFrame>
  );
}

/** A reader opens the registers: what they change on screen is not saved. */
export function ReadOnlyNotice() {
  const { current } = useCloud();
  if (!current || canWrite(current) || !etatOffre(current.offre).actif) return null; // an ended offer: OffreBanner says it
  return (
    <Notice tone="warning" title={`Vous êtes lecteur de « ${current.name} »`}>
      Vous pouvez consulter et exporter les registres, mais vos modifications ne sont pas enregistrées. Un administrateur de l’espace peut vous donner
      le rôle d’éditeur.
    </Notice>
  );
}

const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Where the workspace's offer stands: a trial's days left, an end that comes, an end passed (read only). */
export function OffreBanner() {
  const { current } = useCloud();
  const o = current?.offre;
  if (!current || !o) return null;
  const { actif, jours } = etatOffre(o);
  const limits = [
    o.maxRegistres != null ? `${o.maxRegistres} établissement${o.maxRegistres > 1 ? "s" : ""}` : "",
    o.maxMembres != null ? `${o.maxMembres} personne${o.maxMembres > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (!actif)
    return (
      <Notice tone="danger" title={`L’offre de « ${current.name} » a pris fin le ${dateLong(o.endsAt!)}.`}>
        L’espace est en lecture seule : vos registres restent consultables et exportables. Contactez ABC Consulting pour le prolonger.
      </Notice>
    );
  if (o.plan === "essai" && jours !== null)
    return (
      <Notice title={`Essai gratuit : ${jours} jour${jours > 1 ? "s" : ""} restant${jours > 1 ? "s" : ""}`}>
        Jusqu’au {dateLong(o.endsAt!)}
        {limits ? ` · ${limits}` : ""}. Contactez ABC Consulting pour passer à une offre.
      </Notice>
    );
  if (jours !== null && jours <= 15)
    return (
      <Notice tone="warning" title={`L’offre ${PLANS[o.plan].label} prend fin dans ${jours} jour${jours > 1 ? "s" : ""}`}>
        Le {dateLong(o.endsAt!)}. Contactez ABC Consulting pour la renouveler.
      </Notice>
    );
  return null;
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
  if (done) return <Notice title={done} />;
  if (!canWrite(current)) return null;
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
    <Notice
      title={`${local.length} registre${local.length > 1 ? "s" : ""} enregistré${local.length > 1 ? "s" : ""} dans ce navigateur avant la création des comptes`}
      actions={
        <div className={ui.rowActions}>
          <Button size="sm" variant="primary" onClick={importAll}>
            Importer dans « {current.name} »
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setLocal([])}>
            Plus tard
          </Button>
        </div>
      }
    >
      {local.map((r) => r.nom || "sans nom").join(", ")}
    </Notice>
  );
}
