"use client";
import { Compte } from "@/app/components/equipe";
import { PageHeader } from "@/app/ui";
import { Legacy } from "../_shell/Legacy";

export default function ComptePage() {
  return (
    <>
      <PageHeader title="Mon compte" description="Votre nom, votre mot de passe et votre session." />
      <Legacy>
        <Compte />
      </Legacy>
    </>
  );
}
