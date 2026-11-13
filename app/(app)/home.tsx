"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Accueil } from "@/app/components/accueil";
import { PageHeader } from "@/app/ui";
import { Legacy } from "./_shell/Legacy";

/** Links sent before the screens had their own address (e-mails: ?vue=registres, ?e=… for a classification). */
const OLD_VIEWS: Record<string, string> = { registres: "/registres", veille: "/veille", equipe: "/equipe", compte: "/compte", admin: "/admin", search: "/classement", establishment: "/classement?vue=etablissement" };

export function Home() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const vue = params.get("vue");
    if (vue && OLD_VIEWS[vue]) router.replace(OLD_VIEWS[vue]);
    else if (params.get("e") || params.get("code") || params.get("q")) router.replace(`/classement?${params.toString()}`);
  }, [params, router]);
  return (
    <>
      <PageHeader title="Accueil" />
      <Legacy>
        <Accueil
          onClassify={() => router.push("/classement")}
          onNewRegistre={() => router.push("/registres/nouveau")}
          onOpenRegistre={(id) => router.push(`/registres/${encodeURIComponent(id)}`)}
          onRegistres={() => router.push("/registres")}
          onVeille={() => router.push("/veille")}
        />
      </Legacy>
    </>
  );
}
