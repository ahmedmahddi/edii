"use client";
import { LocalImport, ReadOnlyNotice } from "@/app/components/cloud";
import type { RegistreRoute } from "@/app/components/registres";
import { Veille } from "@/app/components/veille";
import { PageHeader } from "@/app/ui";
import { Legacy } from "../_shell/Legacy";

export function RegistresScreen({ route }: { route: RegistreRoute }) {
  return (
    <>
      {route.kind === "list" ? (
        <PageHeader title="Registres" description="Les textes qui s’appliquent à chaque établissement, leur évaluation et leur suivi." />
      ) : null}
      <Legacy>
        {route.kind === "list" ? (
          <>
            <ReadOnlyNotice />
            <LocalImport />
          </>
        ) : null}
        <Veille tab="registres" route={route} />
      </Legacy>
    </>
  );
}
