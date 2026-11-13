/**
 * The frame of the legal pages (CGU, confidentialité): a readable document with the product's name
 * and a way back. Server component: plain text, no client state.
 */
import type { ReactNode } from "react";

/** The date of the version in force: shown on the pages and recorded with the consent at sign-up. */
export const LEGAL_VERSION = "2026-11-13";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <a className="brand" href="/" aria-label="ABClassement — Accueil">
          <span className="wordmark">
            <span>ABC</span>lassement<span className="brand-period">.</span>
          </span>
        </a>
        <a href="/" className="edii-link">
          ← Retour à l’application
        </a>
      </header>
      <article className="legal card">
        <h1>{title}</h1>
        <p className="muted small">
          Version du {new Date(`${LEGAL_VERSION}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        {children}
      </article>
      <footer className="legal-foot">
        <a href="/cgu">Conditions générales d’utilisation</a>
        <a href="/confidentialite">Politique de confidentialité</a>
        <span>ABClassement — ABC Consulting</span>
      </footer>
    </div>
  );
}
