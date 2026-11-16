import type { Metadata } from "next";
import { Suspense } from "react";
import { ListeClassements } from "./Liste";

export const metadata: Metadata = { title: "Classements | ABClassement" };

export default function ClassementsPage() {
  return (
    <Suspense>
      <ListeClassements />
    </Suspense>
  );
}
