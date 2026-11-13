import type { Metadata } from "next";
import { Equipe } from "./Equipe";

export const metadata: Metadata = { title: "Équipe | ABClassement" };

export default function EquipePage() {
  return <Equipe />;
}
