"use client";
import { Veille } from "@/app/components/veille";
import { PageHeader } from "@/app/ui";
import { Legacy } from "../_shell/Legacy";

export default function VeillePage() {
  return (
    <>
      <PageHeader title="Veille réglementaire" description="Les textes du Journal officiel qui concernent vos établissements." />
      <Legacy>
        <Veille tab="journal" />
      </Legacy>
    </>
  );
}
