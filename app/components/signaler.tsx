"use client";
/**
 * "Signaler un problème" on a text: out of scope for the site, repealed or replaced, a wrong fiche…
 * The report reaches ABC Consulting's administrators (Administration → Signalements). Signed-in
 * accounts only: in local mode there is nowhere to send it.
 */
import { Flag } from "lucide-react";
import { useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { Button, Notice, Segmented, TextArea } from "@/app/ui";
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
  if (done) return <Notice title="Merci : ABC Consulting examinera ce texte.">La réponse s’affichera dans Mon compte.</Notice>;
  if (!open)
    return (
      <Button variant={compact ? "ghost" : "secondary"} size={compact ? "sm" : "md"} onClick={() => setOpen(true)}>
        <Flag size={14} /> Signaler un problème
      </Button>
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
    <div data-ui="" style={{ display: "grid", gap: "var(--ui-space-3)" }}>
      <Segmented<Motif>
        label="Quel est le problème ?"
        value={motif}
        onChange={setMotif}
        options={(Object.keys(MOTIFS) as Motif[]).map((m) => ({ value: m, label: MOTIFS[m] }))}
        block
      />
      <TextArea
        label="Précisez (facultatif)"
        rows={2}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        maxLength={2000}
        placeholder="Ex. : ce décret a été remplacé par…, le site n’a pas cette activité…"
      />
      {error ? <Notice tone="danger" title={error} /> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-space-2)" }}>
        <Button variant="primary" disabled={!motif || busy} onClick={send}>
          {busy ? "Envoi…" : "Envoyer à ABC Consulting"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
