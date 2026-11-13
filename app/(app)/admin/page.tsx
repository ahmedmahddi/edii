import type { Metadata } from "next";
import { Admin } from "./Admin";

export const metadata: Metadata = { title: "Administration | ABClassement" };

export default function AdminPage() {
  return <Admin />;
}
