"use client";
import { Admin } from "@/app/components/admin";
import { PageHeader } from "@/app/ui";
import { Legacy } from "../_shell/Legacy";

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administration" description="Les espaces de vos clients, leur offre, et les signalements sur les textes." />
      <Legacy>
        <Admin />
      </Legacy>
    </>
  );
}
