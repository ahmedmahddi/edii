/**
 * The offers a workspace can have (supabase/migrations/20261115000000_plans.sql): their name, and the
 * limits and length an administrator starts from when choosing one (each can be changed).
 */
export type Plan = "essai" | "standard" | "pro" | "interne";

export const PLANS: Record<Plan, { label: string; registres: number | null; membres: number | null; jours: number | null; note: string }> = {
  essai: { label: "Essai", registres: 2, membres: 3, jours: 30, note: "30 jours, 2 établissements, 3 personnes" },
  standard: { label: "Standard", registres: 5, membres: 10, jours: 365, note: "1 an, 5 établissements, 10 personnes" },
  pro: { label: "Pro", registres: null, membres: null, jours: 365, note: "1 an, établissements et personnes illimités" },
  interne: { label: "Interne", registres: null, membres: null, jours: null, note: "ABC Consulting : sans limite ni fin" },
};

export interface Offre {
  plan: Plan;
  endsAt: string | null; // ISO date and time; null: no end
  maxRegistres: number | null; // null: no limit
  maxMembres: number | null;
}

const DAY = 24 * 3600 * 1000;

/** Where an offer stands today. */
export function etatOffre(o: Offre | undefined, now = new Date()): { actif: boolean; jours: number | null } {
  if (!o || !o.endsAt) return { actif: true, jours: null };
  const left = new Date(o.endsAt).getTime() - now.getTime();
  return { actif: left > 0, jours: Math.ceil(left / DAY) };
}

/** A limit reached, or null. */
export function limiteAtteinte(max: number | null | undefined, count: number): boolean {
  return max != null && count >= max;
}
