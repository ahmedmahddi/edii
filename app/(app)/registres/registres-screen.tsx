"use client";
/** The registers' screens, by address: the list, one register, a new one. */
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { useCloud } from "@/app/components/cloud";
import { Button, EmptyState, Panel } from "@/app/ui";
import { canWrite } from "@/lib/cloud/api";
import { limiteAtteinte } from "@/lib/cloud/plans";
import type { Registre } from "@/lib/registre/registre";
import { useRegistres } from "../_data/registres";
import { useCatalogue } from "../_data/veille";
import { NouveauRegistre } from "./_components/NouveauRegistre";
import { RegistreDetail } from "./_components/RegistreDetail";
import { RegistreList } from "./_components/RegistreList";

export type RegistreRoute = { kind: "list" } | { kind: "open"; id: string } | { kind: "new" };
const hrefOf = (id: string | null) => (id ? `/registres/${encodeURIComponent(id)}` : "/registres");

export function RegistresScreen({ route }: { route: RegistreRoute }) {
  return (
    <Suspense>
      <Screen route={route} />
    </Suspense>
  );
}

function Screen({ route }: { route: RegistreRoute }) {
  const router = useRouter();
  const cloud = useCloud();
  const { list, update, saved, loaded } = useRegistres();
  const { ready, texts, amendments } = useCatalogue();

  // The offer: an ended one makes the workspace read only; its limit caps the establishments.
  const writable = !cloud.current || canWrite(cloud.current);
  const max = cloud.current?.offre?.maxRegistres ?? null;
  const limit =
    cloud.current && limiteAtteinte(max, list.length)
      ? `Limite de l’offre atteinte : ${max} établissement${(max ?? 0) > 1 ? "s" : ""} au plus dans cet espace. Contactez ABC Consulting pour l’étendre.`
      : null;

  if (!loaded || (route.kind !== "list" && !ready)) return <p className="visually-hidden" role="status">Chargement…</p>;

  if (route.kind === "new")
    return (
      <NouveauRegistre
        list={list}
        loaded={loaded}
        update={update}
        texts={texts}
        writable={writable}
        limit={limit}
        onDone={(id) => router.replace(hrefOf(id))}
      />
    );

  if (route.kind === "open") {
    const reg = list.find((r) => r.id === route.id);
    if (!reg)
      return (
        <Panel>
          <EmptyState
            title="Registre introuvable"
            actions={<Button onClick={() => router.push("/registres")}>Tous les registres</Button>}
          >
            Ce registre n’existe pas dans {cloud.current ? `l’espace « ${cloud.current.name} »` : "ce navigateur"}, ou il a été supprimé.
          </EmptyState>
        </Panel>
      );
    const change = (fn: (r: Registre) => Registre) =>
      update((all) => all.map((r) => (r.id === reg.id ? { ...fn(r), maj: new Date().toISOString() } : r)));
    return <RegistreDetail reg={reg} change={change} texts={texts} amendments={amendments} saved={saved} />;
  }

  return <RegistreList list={list} update={update} saved={saved} texts={texts} amendments={amendments} writable={writable} limit={limit} />;
}
