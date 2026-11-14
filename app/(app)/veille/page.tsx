import type { Metadata } from "next";
import { Veille } from "./Veille";

export const metadata: Metadata = { title: "Veille réglementaire | ABClassement" };

export default function VeillePage() {
  return <Veille />;
}
