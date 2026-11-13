"use client";
import { Equipe } from "@/app/components/equipe";
import { PageHeader } from "@/app/ui";
import { Legacy } from "../_shell/Legacy";

export default function EquipePage() {
  return (
    <>
      <PageHeader title="Équipe et espace" description="Les membres de l’espace, leurs droits et les invitations." />
      <Legacy>
        <Equipe />
      </Legacy>
    </>
  );
}
