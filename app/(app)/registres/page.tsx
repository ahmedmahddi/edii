import type { Metadata } from "next";
import { RegistresScreen } from "./registres-screen";

export const metadata: Metadata = { title: "Registres | ABClassement" };

export default function RegistresPage() {
  return <RegistresScreen route={{ kind: "list" }} />;
}
