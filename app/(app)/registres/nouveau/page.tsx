import type { Metadata } from "next";
import { RegistresScreen } from "../registres-screen";

export const metadata: Metadata = { title: "Nouveau registre | ABClassement" };

export default function NouveauRegistrePage() {
  return <RegistresScreen route={{ kind: "new" }} />;
}
