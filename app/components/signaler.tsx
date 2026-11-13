"use client";
/**
 * "Signaler un problème" on a text: out of scope for the site, repealed or replaced, a wrong fiche…
 * The report reaches ABC Consulting's administrators (Administration → Signalements). Signed-in
 * accounts only: in local mode there is nowhere to send it.
 */
import { useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { MOTIFS, type Motif, signaler } from "@/lib/cloud/api";

export function Signaler({ texteId, titre, compact }: { texteId: string; titre: string; compact?: boolean }) {
  const { enabled, user, current } = useCloud();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState<Motif | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  if (!enabled || !user) return null;
  if (done)
    return (
      <p className="auth-done signaler-done" role="status">
        Merci : ABC Consulting examinera ce texte. La réponse s’affichera dans Mon compte.
      </p>
    );
  if (!open)
    return (
      <button type="button" className={compact ? "edii-link signaler-link" : "secondary-button signaler-open"} onClick={() => setOpen(true)}>
        Signaler un problème
      </button>
    );
  const send = async () => {
    if (!motif) return;
    setBusy(true);
    setError("");
    try {
      await signaler({ workspace: current?.id ?? null, texteId, titre, motif, commentaire });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="signaler">
      <span className="panel-label">Quel est le problème ?</span>
      <div className="signaler-motifs" role="radiogroup" aria-label="Motif">
        {(Object.keys(MOTIFS) as Motif[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={motif === m} className={motif === m ? "chip active" : "chip"} onClick={() => setMotif(m)}>
            {MOTIFS[m]}
          </button>
        ))}
      </div>
      <label>
        <span>Précisez (facultatif)</span>
        <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={2000} placeholder="Ex. : ce décret a été remplacé par…, le site n’a pas cette activité…" />
      </label>
      {error ? (
        <p className="registre-warning" role="alert">
          {error}
        </p>
      ) : null}
      <div className="evidence-actions">
        <button type="button" disabled={!motif || busy} onClick={send}>
          {busy ? "Envoi…" : "Envoyer à ABC Consulting"}
        </button>
        <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}
