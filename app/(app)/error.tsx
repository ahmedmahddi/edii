"use client";
/** A screen that failed: said plainly, reported to ABC Consulting, and a way to try again. */
import { useEffect } from "react";
import { Button, EmptyState, Panel } from "@/app/ui";
import { reportError } from "@/lib/erreurs";

export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error, { digest: error.digest }), [error]);
  return (
    <Panel>
      <EmptyState
        title="Cet écran a rencontré un problème"
        actions={
          <>
            <Button variant="primary" onClick={reset}>
              Réessayer
            </Button>
            <Button onClick={() => location.assign("/")}>Retour à l’accueil</Button>
          </>
        }
      >
        L’erreur a été signalée à ABC Consulting. Vos registres déjà enregistrés ne sont pas touchés.
      </EmptyState>
    </Panel>
  );
}
