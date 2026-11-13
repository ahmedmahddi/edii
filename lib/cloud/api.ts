/**
 * What the app reads and changes in Supabase. Every call goes through row-level security: a user
 * only reaches the workspaces they belong to (supabase/migrations/20261112000000_workspaces.sql).
 */
import type { Registre } from "@/lib/registre/registre";
import { cloud } from "./client";

export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLE_LABEL: Record<Role, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
};
export const ROLE_HELP: Record<Role, string> = {
  owner: "Tous les droits, dont supprimer l’espace et nommer d’autres propriétaires",
  admin: "Gère les membres et les invitations, modifie les registres",
  editor: "Crée et modifie les registres",
  viewer: "Consulte et exporte les registres",
};
export const canEdit = (role: Role | null | undefined) => role === "owner" || role === "admin" || role === "editor";
export const canManage = (role: Role | null | undefined) => role === "owner" || role === "admin";

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}
export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  since: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  created: string;
}
export interface MyInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
  invitedBy: string | null;
}

function db() {
  const c = cloud();
  if (!c) throw new Error("Supabase n’est pas configuré");
  return c;
}

/** A message for the user from a Supabase error (the database's own messages are in French). */
function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function myWorkspaces(userId: string): Promise<Workspace[]> {
  const { data, error } = await db()
    .from("memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", userId);
  fail(error);
  return ((data ?? []) as unknown as { role: Role; organizations: { id: string; name: string } | null }[])
    .filter((m) => m.organizations)
    .map((m) => ({ id: m.organizations!.id, name: m.organizations!.name, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createWorkspace(name: string): Promise<string> {
  const { data, error } = await db().rpc("create_workspace", { workspace_name: name });
  fail(error);
  return data as string;
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const { error } = await db().from("organizations").update({ name }).eq("id", id);
  fail(error);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await db().from("organizations").delete().eq("id", id);
  fail(error);
}

export async function members(workspace: string): Promise<Member[]> {
  const { data, error } = await db()
    .from("memberships")
    .select("user_id, role, created_at, profiles(email, full_name)")
    .eq("organization_id", workspace);
  fail(error);
  const order: Role[] = ["owner", "admin", "editor", "viewer"];
  return ((data ?? []) as unknown as { user_id: string; role: Role; created_at: string; profiles: { email: string; full_name: string | null } | null }[])
    .map((m) => ({ userId: m.user_id, email: m.profiles?.email ?? "", name: m.profiles?.full_name ?? null, role: m.role, since: m.created_at }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.email.localeCompare(b.email));
}

export async function invitations(workspace: string): Promise<Invitation[]> {
  const { data, error } = await db()
    .from("invitations")
    .select("id, email, role, created_at")
    .eq("organization_id", workspace)
    .order("created_at");
  fail(error);
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as Role, created: i.created_at }));
}

export async function invite(workspace: string, email: string, role: Role, by: string): Promise<void> {
  const { error } = await db()
    .from("invitations")
    .insert({ organization_id: workspace, email: email.trim().toLowerCase(), role, invited_by: by });
  if (error?.code === "23505") throw new Error("Cette adresse est déjà invitée.");
  fail(error);
}

export async function cancelInvitation(id: string): Promise<void> {
  const { error } = await db().from("invitations").delete().eq("id", id);
  fail(error);
}

export async function myInvitations(): Promise<MyInvitation[]> {
  const { data, error } = await db().rpc("my_invitations");
  fail(error);
  return ((data ?? []) as { id: string; organization_id: string; organization_name: string; role: Role; invited_by_email: string | null }[]).map((i) => ({
    id: i.id,
    workspaceId: i.organization_id,
    workspaceName: i.organization_name,
    role: i.role,
    invitedBy: i.invited_by_email,
  }));
}

export async function acceptInvitation(id: string): Promise<string> {
  const { data, error } = await db().rpc("accept_invitation", { invitation: id });
  fail(error);
  return data as string;
}

export async function setMemberRole(workspace: string, member: string, role: Role): Promise<void> {
  const { error } = await db().rpc("set_member_role", { org: workspace, member, new_role: role });
  fail(error);
}

export async function removeMember(workspace: string, member: string): Promise<void> {
  const { error } = await db().rpc("remove_member", { org: workspace, member });
  fail(error);
}

export async function updateMyName(userId: string, name: string): Promise<void> {
  const { error } = await db().from("profiles").update({ full_name: name.trim() || null }).eq("id", userId);
  fail(error);
}

/** Whether the account receives the weekly digest e-mail. */
export async function myNotifications(userId: string): Promise<boolean> {
  const { data, error } = await db().from("profiles").select("notifications").eq("id", userId).maybeSingle();
  if (error) return true; // the column comes with a migration: until it runs, the default
  return (data?.notifications as boolean | undefined) ?? true;
}

export async function setMyNotifications(userId: string, on: boolean): Promise<void> {
  const { error } = await db().from("profiles").update({ notifications: on }).eq("id", userId);
  fail(error);
}

export async function myName(userId: string): Promise<string | null> {
  const { data, error } = await db().from("profiles").select("full_name").eq("id", userId).maybeSingle();
  fail(error);
  return (data?.full_name as string | null) ?? null;
}

// Registers: one row per register, the register itself as JSON.

export async function fetchRegistres(workspace: string): Promise<Registre[]> {
  const { data, error } = await db().from("registres").select("data").eq("organization_id", workspace);
  fail(error);
  return (data ?? []).map((r) => r.data as Registre);
}

export async function upsertRegistres(workspace: string, list: Registre[]): Promise<void> {
  if (!list.length) return;
  const { error } = await db()
    .from("registres")
    .upsert(list.map((r) => ({ organization_id: workspace, id: r.id, nom: r.nom, data: r })), { onConflict: "organization_id,id" });
  fail(error);
}

export async function deleteRegistres(workspace: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db().from("registres").delete().eq("organization_id", workspace).in("id", ids);
  fail(error);
}

// Evidence files: the "preuves" bucket, one folder per workspace (supabase/migrations/…_preuves.sql).

export const PREUVES_BUCKET = "preuves";
export const PREUVE_MAX_BYTES = 10 * 1024 * 1024;

/** Upload a file as evidence; returns its path in the bucket. */
export async function uploadPreuve(workspace: string, registre: string, file: File): Promise<string> {
  if (file.size > PREUVE_MAX_BYTES) throw new Error("Fichier trop lourd : 10 Mo au plus.");
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80);
  const path = `${workspace}/${registre}/${Date.now().toString(36)}-${safe}`;
  const { error } = await db().storage.from(PREUVES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  fail(error);
  return path;
}

/** A link to an uploaded file, valid for an hour. */
export async function preuveUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(PREUVES_BUCKET).createSignedUrl(path, 3600);
  fail(error);
  return data!.signedUrl;
}

export async function deletePreuve(path: string): Promise<void> {
  const { error } = await db().storage.from(PREUVES_BUCKET).remove([path]);
  fail(error);
}
