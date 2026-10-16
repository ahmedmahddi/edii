import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Classement EDII",
  description: "Classement des établissements dangereux, insalubres ou incommodes (Tunisie) et étude environnementale ANPE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
