"use client";
/**
 * The screens before the app: sign in, create an account, ask for a new password, choose one, and
 * the frame they share (also used by the onboarding in cloud.tsx).
 */
import { Building2, FileCheck2, Newspaper, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { LEGAL_VERSION } from "@/app/components/legal";
import { Button, Checkbox, Notice, TextField } from "@/app/ui";
import { cloud } from "@/lib/cloud/client";
import { frenchError } from "@/lib/cloud/errors";
import s from "./auth.module.css";

export function Wordmark() {
  return (
    <span className={s.wordmark}>
      <span className={s.mark} aria-hidden="true">
        A
      </span>
      ABClassement
    </span>
  );
}

export function Splash({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className={s.splash} role="status">
      {label}
    </div>
  );
}

const LegalLinks = () => (
  <nav className={s.foot} aria-label="Informations légales">
    <a href="/cgu">Conditions générales</a>
    <a href="/confidentialite">Confidentialité</a>
    <span>ABC Consulting</span>
  </nav>
);

/** One column, centred: the product's name, a title, what to do. */
export function AuthFrame({ title, lead, children, wide, aside }: { title: string; lead?: ReactNode; children: ReactNode; wide?: boolean; aside?: ReactNode }) {
  return (
    <div className={s.page} style={aside ? undefined : { gridTemplateColumns: "1fr" }}>
      <div className={s.formSide}>
        <main className={[s.column, wide ? s.wide : ""].join(" ")}>
          <Wordmark />
          <div className={s.heading}>
            <h1 className={s.title}>{title}</h1>
            {lead ? <p className={s.lead}>{lead}</p> : null}
          </div>
          {children}
        </main>
        <LegalLinks />
      </div>
      {aside}
    </div>
  );
}

export function AuthSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

const FEATURES = [
  { icon: Building2, title: "Classement EDII", text: "La catégorie de chaque site et l’étude ANPE qu’elle impose." },
  { icon: FileCheck2, title: "Registre réglementaire", text: "Les textes applicables à chaque établissement, évalués et prouvés, prêts pour l’audit." },
  { icon: Newspaper, title: "Veille du JORT", text: "Chaque numéro du Journal officiel lu : les nouveaux textes et les modifications qui vous concernent." },
  { icon: Users, title: "Un espace par entreprise", text: "Privé, partagé avec votre équipe et vos consultants, avec des droits par personne." },
];

function Pitch() {
  return (
    <aside className={s.pitch} aria-label="ABClassement">
      <p className={s.pitchTitle}>La conformité réglementaire de vos établissements en Tunisie, tenue à jour.</p>
      <ul className={s.features}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className={s.feature}>
            <span className={s.featureIcon}>
              <Icon size={16} />
            </span>
            <span>
              <span className={s.featureTitle}>{title}</span>
              <br />
              <span className={s.featureText}>{text}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/abc-consulting.jpg" alt="ABC Consulting" width="763" height="366" className={s.logo} />
    </aside>
  );
}

type Mode = "connexion" | "inscription" | "oubli";
const TITLE: Record<Mode, string> = { connexion: "Connexion", inscription: "Créer un compte", oubli: "Mot de passe oublié" };
const LEAD: Record<Mode, string> = {
  connexion: "Accédez aux registres et à la veille de votre entreprise.",
  inscription: "Votre compte personnel. Vous créerez ensuite l’espace de votre entreprise, ou rejoindrez celui qui vous invite.",
  oubli: "Nous vous envoyons un lien pour en choisir un nouveau.",
};

/** Sign in, create an account, or ask for a new password. */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setDone("");
  };

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
        if (!consent) throw new Error("Acceptez les conditions générales et la politique de confidentialité pour créer un compte.");
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          // The consent is recorded with the account: the version accepted and when.
          options: { data: { full_name: fullName.trim(), cgu: LEGAL_VERSION, cgu_acceptees: new Date().toISOString() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setDone(`Un e-mail de confirmation a été envoyé à ${email.trim()}. Ouvrez le lien qu’il contient pour activer votre compte, puis connectez-vous.`);
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

  return (
    <AuthFrame title={TITLE[mode]} lead={LEAD[mode]} aside={<Pitch />}>
      {done ? <Notice title={done} /> : null}
      <form onSubmit={submit} className={s.form}>
        {mode === "inscription" ? <TextField label="Nom et prénom" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /> : null}
        <TextField label="Adresse e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        {mode !== "oubli" ? (
          <TextField
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "connexion" ? "current-password" : "new-password"}
            minLength={mode === "inscription" ? 8 : undefined}
            hint={mode === "inscription" ? "8 caractères au moins." : undefined}
            required
          />
        ) : null}
        {mode === "inscription" ? (
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} required>
            J’accepte les{" "}
            <a href="/cgu" target="_blank" rel="noreferrer">
              conditions générales d’utilisation
            </a>{" "}
            et la{" "}
            <a href="/confidentialite" target="_blank" rel="noreferrer">
              politique de confidentialité
            </a>
            .
          </Checkbox>
        ) : null}
        {error ? <Notice tone="danger" title={error} /> : null}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? "Un instant…" : mode === "connexion" ? "Se connecter" : mode === "inscription" ? "Créer mon compte" : "Recevoir un lien"}
        </Button>
      </form>
      <div className={s.links}>
        {mode !== "connexion" ? (
          <button type="button" className={s.link} onClick={() => go("connexion")}>
            J’ai déjà un compte
          </button>
        ) : (
          <>
            <button type="button" className={s.link} onClick={() => go("inscription")}>
              Créer un compte
            </button>
            <button type="button" className={s.link} onClick={() => go("oubli")}>
              Mot de passe oublié ?
            </button>
          </>
        )}
      </div>
    </AuthFrame>
  );
}

/** After the link of a "mot de passe oublié" e-mail. */
export function NewPassword({ onDone }: { onDone: () => void }) {
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
    <AuthFrame title="Nouveau mot de passe" lead="Choisissez le mot de passe de votre compte.">
      <form onSubmit={submit} className={s.form}>
        <TextField label="Nouveau mot de passe" hint="8 caractères au moins." type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        {error ? <Notice tone="danger" title={error} /> : null}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          Enregistrer
        </Button>
      </form>
    </AuthFrame>
  );
}
