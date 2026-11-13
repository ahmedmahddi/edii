import type { Metadata } from "next";
import { Suspense } from "react";
import { Home } from "./home";

export const metadata: Metadata = { title: "Accueil | ABClassement" };

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
