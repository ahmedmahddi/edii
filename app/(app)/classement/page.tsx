import { Suspense } from "react";
import { Classement } from "./classement";

export const metadata = { title: "Classement | ABClassement" };

export default function ClassementPage() {
  return (
    <Suspense>
      <Classement />
    </Suspense>
  );
}
