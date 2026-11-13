import type { Metadata } from "next";
import { Compte } from "./Compte";

export const metadata: Metadata = { title: "Mon compte | ABClassement" };

export default function ComptePage() {
  return <Compte />;
}
