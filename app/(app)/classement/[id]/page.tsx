import type { Metadata } from "next";
import { Suspense } from "react";
import { ClassementEditor } from "../Editeur";

export const metadata: Metadata = { title: "Classement | ABClassement" };

export default async function ClassementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ClassementEditor id={decodeURIComponent(id)} />
    </Suspense>
  );
}
