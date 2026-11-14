"use client";
/**
 * The JORT checked at once: the issues published since the last reading are read by the server
 * (app/api/veille); their texts join the veille and the registers in this browser until the site
 * carries them.
 */
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, Notice } from "@/app/ui";
import { dateCourte } from "@/lib/registre/labels";
import { alertes, nouveautes } from "@/lib/registre/registre";
import { registres } from "@/lib/registre/store";
import type { LiveCheck } from "@/lib/veille/live";
import { saveLive } from "@/lib/veille/live-store";
import { lastIssue, type VeilleMeta, withLiveIssues } from "@/lib/veille/served";
import { veilleBase } from "../_data/veille";
import s from "./veille.module.css";

const SAVE: Record<string, string> = {
  enregistre: "Ils sont enregistrés : ils seront dans la veille de tous les postes après la mise à jour du site (quelques minutes).",
  deja: "Ils viennent d’être enregistrés : ils seront dans la veille de tous les postes après la mise à jour du site (quelques minutes).",
  "non-configure": "Ils sont gardés dans ce navigateur ; la lecture quotidienne les enregistrera pour tous les postes.",
  echec: "Ils sont gardés dans ce navigateur ; ils n’ont pas pu être enregistrés, la lecture quotidienne s’en chargera.",
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

type Check = LiveCheck & { enregistrement?: string };
type State =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; check: Check; hits: number; important: number; news: number; alerts: number }
  | { state: "error"; message: string };

export function Verifier({ meta }: { meta: VeilleMeta | null }) {
  const client = useQueryClient();
  const [v, setV] = useState<State>({ state: "idle" });
  const last = meta ? lastIssue(meta.scanned) : null;
  const lastDate = last ? meta?.recent.find((h) => h.year === last.year && h.issue === last.number)?.date : null;

  const run = async () => {
    setV({ state: "running" });
    try {
      const base = await veilleBase(client);
      const year = new Date().getFullYear();
      const scanned = Object.fromEntries(Object.entries(base.meta.scanned).filter(([y]) => Number(y) >= year - 1));
      const res = await fetch("/api/veille", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scanned }) });
      const body = (await res.json()) as Check | { error: string };
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      // What the new issues bring: texts found, and for the registers, new texts that apply and texts of theirs modified.
      const next = withLiveIssues(base, body.issues);
      const known = new Set(base.catalogue.map((t) => t.id));
      const fresh = new Set(next.catalogue.filter((t) => !known.has(t.id)).map((t) => t.id));
      const knownA = new Set(base.amendements.map((a) => a.id));
      const added = next.amendements.filter((a) => !knownA.has(a.id));
      const regs = registres.get();
      const news = fresh.size ? regs.reduce((n, r) => n + nouveautes(r, next.catalogue).filter((p) => fresh.has(p.texte.id)).length, 0) : 0;
      const alerts = added.length ? regs.reduce((n, r) => n + alertes(r, added).length, 0) : 0;
      const newHits = next.meta.recent.filter((h) => fresh.has(`jort-${h.id}`));
      if (body.issues.length) saveLive(body);
      setV({ state: "done", check: body, hits: newHits.length, important: newHits.filter((h) => h.severity !== "information").length, news, alerts });
    } catch (error) {
      setV({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const read = v.state === "done" ? v.check.issues.filter((i) => i.issue) : [];
  const waiting = v.state === "done" ? v.check.issues.filter((i) => !i.issue) : [];
  return (
    <div className={s.verifier}>
      <div className={s.check}>
        <span className={s.checkText}>
          <span>{last ? `Journal officiel lu jusqu’au n° ${last.number}/${last.year}${lastDate ? `, paru le ${dateCourte(lastDate)}` : ""}` : "Aucun numéro du JORT lu pour l’instant"}</span>
          {meta?.updated ? <span className={s.muted}>Dernière lecture automatique le {dateCourte(meta.updated.slice(0, 10))}</span> : null}
        </span>
        <Button onClick={run} disabled={v.state === "running"}>
          <RefreshCw size={14} /> {v.state === "running" ? "Lecture du JORT…" : "Vérifier maintenant"}
        </Button>
      </div>
      <div aria-live="polite" className={s.live}>
        {v.state === "running" ? <Notice title="Lecture des numéros parus depuis, sur jort.tn (jusqu’à une minute)…" /> : null}
        {v.state === "error" ? <Notice tone="danger" title={`Le JORT n’a pas pu être lu : ${v.message}`}>Réessayez plus tard.</Notice> : null}
        {v.state === "done" ? (
          read.length || waiting.length ? (
            <Notice
              title={
                read.length
                  ? `${plural(read.length, "nouveau numéro", "nouveaux numéros")} lu${read.length > 1 ? "s" : ""} (n° ${read.map((i) => i.number).join(", ")}) : ${plural(v.hits, "texte repéré", "textes repérés")}${v.hits ? `, dont ${plural(v.important, "important")}` : ""}`
                  : "Pas encore lisible"
              }
            >
              {read.length
                ? v.news || v.alerts
                  ? `Pour vos registres : ${[v.news ? plural(v.news, "nouveau texte", "nouveaux textes") : "", v.alerts ? plural(v.alerts, "texte modifié", "textes modifiés") : ""].filter(Boolean).join(", ")}. `
                  : "Rien de nouveau pour vos registres. "
                : ""}
              {waiting.length ? `Publié${waiting.length > 1 ? "s" : ""} mais pas encore lisible${waiting.length > 1 ? "s" : ""} (texte en préparation sur ocr.jort.tn) : n° ${waiting.map((i) => `${i.number}/${i.year}`).join(", ")}. ` : ""}
              {v.check.remaining ? `${v.check.remaining} autre(s) numéro(s) à lire : vérifiez à nouveau. ` : ""}
              {read.length && v.check.enregistrement ? SAVE[v.check.enregistrement] ?? "" : ""}
            </Notice>
          ) : (
            <Notice title="Aucun nouveau numéro : la veille est à jour." />
          )
        ) : null}
      </div>
    </div>
  );
}
