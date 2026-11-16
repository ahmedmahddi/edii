import type { Metadata } from "next";
import { Suspense } from "react";
import { NouveauClassement } from "./Nouveau";

export const metadata: Metadata = { title: "Nouveau classement | ABClassement" };

export default function NouveauClassementPage() {
  return (
    <Suspense>
      <NouveauClassement />
    </Suspense>
  );
}
