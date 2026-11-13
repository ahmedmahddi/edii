"use client";
/** The account: name shown to colleagues, the weekly e-mail, appearance, password, reports sent, session. */
import { useEffect, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { Badge, Button, Notice, PageHeader, Section, Segmented, Switch, TextField, type Theme, useTheme } from "@/app/ui";
import { mesSignalements, MOTIFS, myNotifications, setMyNotifications, type Signalement, STATUTS_SIGNALEMENT, updateMyName } from "@/lib/cloud/api";
import { cloud } from "@/lib/cloud/client";
import { dateFr } from "@/lib/registre/labels";
import s from "../_settings/settings.module.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Compte() {
  const { user, name, setName, signOut } = useCloud();
  const { theme, setTheme } = useTheme();
  const [fullName, setFullName] = useState(name ?? "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notify, setNotify] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Signalement[]>([]);
  useEffect(() => {
    if (!user) return;
    void mesSignalements(user.id).then(setReports);
    void myNotifications(user.id).then(setNotify);
  }, [user]);
  useEffect(() => setFullName(name ?? ""), [name]);

  const appearance = (
    <Segmented<Theme>
      label="Apparence"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "auto", label: "Automatique" },
        { value: "light", label: "Clair" },
        { value: "dark", label: "Sombre" },
      ]}
    />
  );
  // Local mode: no account, only the appearance.
  if (!user)
    return (
      <div className={s.page}>
        <PageHeader title="Réglages" description="Mode local : les registres restent dans ce navigateur." />
        <Section title="Apparence" description="Celle de l’appareil, ou toujours claire ou sombre.">
          {appearance}
        </Section>
      </div>
    );

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
    <div className={s.page}>
      <PageHeader title="Mon compte" description={`Connecté avec ${user.email}.`} />
      {note ? <Notice title={note} /> : null}
      {error ? <Notice tone="danger" title={error} /> : null}

      <Section title="Identité" description="Votre nom, tel que vos collègues le voient dans les évaluations.">
        <form
          className={s.inline}
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await updateMyName(user.id, fullName);
              setName(fullName.trim() || null);
            }, "Nom enregistré.");
          }}
        >
          <TextField label="Nom et prénom" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          <Button type="submit">Enregistrer</Button>
        </form>
      </Section>

      <Section title="Récapitulatif par e-mail" description="Un seul e-mail pour tous vos espaces.">
        <Switch
          label="Chaque lundi"
          description="Évaluations en retard ou à venir, actions à suivre, nouveaux textes du JORT."
          checked={notify ?? true}
          disabled={notify === null}
          onChange={(e) => {
            const on = e.target.checked;
            setNotify(on);
            void act(() => setMyNotifications(user.id, on), on ? "Récapitulatif activé." : "Récapitulatif arrêté.");
          }}
        />
      </Section>

      <Section title="Apparence" description="Celle de l’appareil, ou toujours claire ou sombre.">
        {appearance}
      </Section>

      <Section title="Mot de passe" description="8 caractères au moins.">
        <form
          className={s.inline}
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
          <TextField label="Nouveau mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          <Button type="submit">Changer</Button>
        </form>
      </Section>

      {reports.length ? (
        <Section title="Vos signalements" description="Les problèmes signalés sur des textes, et la réponse d’ABC Consulting.">
          <ul className={s.list}>
            {reports.map((r) => (
              <li key={r.id} className={s.row}>
                <span className={s.who}>
                  <span className={s.name} dir="auto">
                    {r.titre}
                  </span>
                  <span className={s.meta}>
                    {MOTIFS[r.motif]} · {dateFr(r.created.slice(0, 10))}
                  </span>
                  {r.reponse ? <span className={s.muted}>Réponse : {r.reponse}</span> : null}
                </span>
                <Badge tone={r.statut === "nouveau" ? "warning" : r.statut === "traite" ? "success" : "neutral"} dot>
                  {STATUTS_SIGNALEMENT[r.statut]}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Session" description="Sur cet appareil.">
        <div>
          <Button onClick={() => void signOut()}>Se déconnecter</Button>
        </div>
      </Section>
    </div>
  );
}
