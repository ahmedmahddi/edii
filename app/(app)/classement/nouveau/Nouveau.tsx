"use client";
/**
 * A new classification: made at once (with the dossier of a link of before, ?e=…&s=…&z=1, when
 * there is one), then opened. Left empty, it is not kept.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { nouveauClassement } from "@/lib/classement/classement";
import { classements } from "@/lib/classement/store";
import { decodeActivities } from "@/lib/establishment";
import { SITUATIONS, type Situation } from "@/lib/studies";
import { useClassements } from "../../_data/classements";

export function NouveauClassement() {
  const router = useRouter();
  const params = useSearchParams();
  const list = useClassements();
  const made = useRef(false);
  useEffect(() => {
    if (!list || made.current) return;
    made.current = true;
    const s = params.get("s");
    const c = nouveauClassement(new Date(), {
      activites: decodeActivities(params.get("e")),
      situation: s && s in SITUATIONS ? (s as Situation) : "projet",
      sensible: params.get("z") === "1",
    });
    classements.update((all) => [c, ...all]);
    router.replace(`/classement/${c.id}${c.activites.length ? "?vue=etablissement" : ""}`);
  }, [list, params, router]);
  return <p className="visually-hidden" role="status">Création du classement…</p>;
}
