"use client";
/** The app itself failed (its frame): the last resort, without the app's styles. */
import { useEffect } from "react";
import { reportError } from "@/lib/erreurs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error, { digest: error.digest }), [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, color: "#12161c" }}>
        <h1 style={{ fontSize: 20 }}>ABClassement a rencontré un problème</h1>
        <p>L’erreur a été signalée à ABC Consulting. Rechargez la page ; si le problème revient, contactez-nous.</p>
        <button type="button" onClick={reset} style={{ padding: "8px 14px" }}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
