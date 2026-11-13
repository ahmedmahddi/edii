import type { Metadata } from "next";
import { RegistresScreen } from "../registres-screen";

export const metadata: Metadata = { title: "Registre | ABClassement" };

export default async function RegistrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistresScreen route={{ kind: "open", id: decodeURIComponent(id) }} />;
}
