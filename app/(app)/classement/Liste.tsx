"use client";
/** Every classification kept: its category, study and synthesis, the register it started; open, copy, delete. */
import { Building2, Copy, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { Badge, Button, ButtonLink, EmptyState, Menu, MenuItem, MenuSeparator, PageHeader, Panel, SearchInput, table } from "@/app/ui";
import { canWrite } from "@/lib/cloud/api";
import { type Classement, dupliquer, etatClassement, STATUTS } from "@/lib/classement/classement";
import { classements } from "@/lib/classement/store";
import { dateCourte } from "@/lib/registre/labels";
import { fold } from "@/lib/veille/watch";
import { useClassements } from "../_data/classements";
import { useRegistreList } from "../_data/registres";
import s from "./classement.module.css";
import { ClasseBadge, STUDY_SHORT } from "./shared";

const href = (id: string) => `/classement/${encodeURIComponent(id)}`;

export function ListeClassements() {
  const router = useRouter();
  const params = useSearchParams();
  const cloud = useCloud();
  const list = useClassements();
  const regs = useRegistreList();
  const [query, setQuery] = useState("");
  const writable = !cloud.current || canWrite(cloud.current);

  // Links of before (a dossier in the address: ?e=…): opened as a new classification.
  useEffect(() => {
    if (params.get("e") || params.get("code") || params.get("q")) router.replace(`/classement/nouveau?${params.toString()}`);
  }, [params, router]);

  const rows = useMemo(() => {
    const q = fold(query);
    return (list ?? [])
      .filter((c) => !q || fold(`${c.nom} ${c.activites.map((a) => a.code).join(" ")}`).includes(q))
      .sort((a, b) => b.maj.localeCompare(a.maj))
      .map((c) => ({ c, e: etatClassement(c) }));
  }, [list, query]);
  const registreOf = (c: Classement) => (c.registre ? regs?.find((r) => r.id === c.registre) : undefined);

  const remove = (c: Classement) => {
    if (confirm(`Supprimer le classement « ${c.nom || "sans nom"} » ? Le registre qu’il a créé, s’il y en a un, est gardé.`)) classements.remove(c.id);
  };
  const copy = (c: Classement) => {
    const d = dupliquer(c);
    classements.update((all) => [d, ...all]);
    router.push(href(d.id));
  };

  const newButton = writable ? (
    <ButtonLink href="/classement/nouveau" variant="primary">
      <Plus size={15} /> Nouveau classement
    </ButtonLink>
  ) : null;

  return (
    <div className={s.screen}>
      <PageHeader
        title="Classements"
        description="Les établissements classés selon la nomenclature, leur étude ANPE et leur synthèse ; chacun peut créer son registre."
        actions={newButton}
      />
      {list && !list.length ? (
        <Panel>
          <EmptyState
            icon={<Building2 size={20} />}
            title="Aucun classement pour l’instant"
            actions={
              <>
                {newButton}
                <ButtonLink href="/classement/nouveau">
                  <Search size={15} /> Parcourir la nomenclature
                </ButtonLink>
              </>
            }
          >
            Un classement réunit les activités d’un établissement, leurs quantités et l’étude ANPE ; validé, il produit la synthèse et crée le registre de
            l’établissement.
          </EmptyState>
        </Panel>
      ) : list ? (
        <>
          <SearchInput label="Rechercher un classement" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, rubrique…" />
          <div className={table.wrap}>
            <table className={`${table.table} ${table.stack}`}>
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th>Catégorie</th>
                  <th>Étude ANPE</th>
                  <th>Synthèse</th>
                  <th>Registre</th>
                  <th className={table.num}>Mis à jour</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, e }) => {
                  const reg = registreOf(c);
                  return (
                    <tr key={c.id} data-href="" onClick={() => router.push(href(c.id))}>
                      <td data-slot="main">
                        <Link href={href(c.id)} className={table.primary} onClick={(ev) => ev.stopPropagation()}>
                          {c.nom || "Établissement sans nom"}
                        </Link>
                        <span className={table.secondary}>
                          {c.activites.length
                            ? `${c.activites.length} activité${c.activites.length > 1 ? "s" : ""} · ${c.activites.map((a) => a.code).join(", ")}`
                            : "Aucune activité"}
                        </span>
                      </td>
                      <td data-slot="side">{e.classe !== null ? <ClasseBadge classe={e.classe} /> : <span className={table.muted}>—</span>}</td>
                      <td data-slot="meta">
                        <span className={table.phoneLabel}>Étude ANPE : </span>
                        {e.etude ? STUDY_SHORT[e.etude] : c.activites.length ? <span className={table.muted}>à choisir</span> : "—"}
                      </td>
                      <td data-slot="meta">
                        <Badge tone={e.statut === "valide" ? "success" : e.statut === "a-revalider" ? "warning" : "neutral"} dot>
                          {STATUTS[e.statut]}
                        </Badge>
                      </td>
                      <td data-slot={reg ? "meta" : "hide"} onClick={(ev) => ev.stopPropagation()}>
                        <span className={table.phoneLabel}>Registre : </span>
                        {reg ? <Link href={`/registres/${encodeURIComponent(reg.id)}`}>{reg.nom}</Link> : <span className={table.muted}>—</span>}
                      </td>
                      <td data-slot="hide" className={`${table.num} ${table.muted}`}>
                        {dateCourte(c.maj.slice(0, 10))}
                      </td>
                      <td data-slot="action" style={{ width: 40 }} onClick={(ev) => ev.stopPropagation()}>
                        <Menu
                          align="end"
                          trigger={
                            <Button variant="ghost" size="sm" icon aria-label={`Actions sur « ${c.nom || "sans nom"} »`}>
                              <MoreHorizontal size={15} />
                            </Button>
                          }
                        >
                          <MenuItem onSelect={() => router.push(href(c.id))}>Ouvrir</MenuItem>
                          {writable ? (
                            <>
                              <MenuItem icon={<Copy size={15} />} onSelect={() => copy(c)}>
                                Dupliquer
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => remove(c)}>
                                Supprimer
                              </MenuItem>
                            </>
                          ) : null}
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p className={s.note}>Aucun classement ne correspond.</p> : null}
        </>
      ) : null}
    </div>
  );
}
