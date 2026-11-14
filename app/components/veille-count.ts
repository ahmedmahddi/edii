"use client";
/** The menu's count: what waits in the registers (evaluations late, texts modified at the JORT). */
import { useMemo } from "react";
import { useRegistreList } from "@/app/(app)/_data/registres";
import { useAmendements } from "@/app/(app)/_data/veille";
import { aTraiter } from "@/lib/registre/registre";

/** What waits in the registers (evaluations late, texts modified at the JORT), kept up to date: the menu's count. */
export function useVeilleCount(): number {
  const amendements = useAmendements();
  const list = useRegistreList();
  return useMemo(() => (amendements && list ? aTraiter(list, amendements) : 0), [amendements, list]);
}
