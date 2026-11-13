"use client";
/** Every register of the workspace (or of this browser): where each stands, and the backup file. */
import { Building2, Download, MoreHorizontal, Plus, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { LocalImport, OffreBanner, ReadOnlyNotice, useCloud } from "@/app/components/cloud";
import { download, today } from "@/app/components/download";
import { Badge, Button, ButtonLink, EmptyState, Menu, MenuItem, MenuSeparator, Notice, PageHeader, Panel, Progress, table } from "@/app/ui";
import { aJour, etatRegistre } from "@/lib/registre/etat";
import { classLabel, dateCourte } from "@/lib/registre/labels";
import { metierLabels } from "@/lib/registre/profil";
import type { Texte } from "@/lib/registre/referentiel";
import { backup, type Registre, restore } from "@/lib/registre/registre";
import { study } from "@/lib/studies";
import type { Amendment } from "@/lib/veille/watch";
import s from "./Registres.module.css";

const href = (id: string) => `/registres/${encodeURIComponent(id)}`;

export function RegistreList({
  list,
  update,
  saved,
  texts,
  amendments,
  writable,
  limit,
}: {
  list: Registre[];
  update: (fn: (list: Registre[]) => Registre[]) => void;
  saved: boolean;
  texts: Texte[];
  amendments: Amendment[];
  writable: boolean;
  /** The offer's cap on establishments, when reached: what to say. */
  limit: string | null;
}) {
  const router = useRouter();
  const cloud = useCloud();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const etats = useMemo(() => list.map((reg) => ({ reg, ...etatRegistre(reg, amendments, texts) })), [list, amendments, texts]);

  const restoreFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      update((all) => restore(all, text));
      setMessage("Sauvegarde restaurée.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fichier illisible.");
    }
  };
  const remove = (r: Registre) => {
    if (confirm(`Supprimer le registre « ${r.nom} »${cloud.current ? ` de l’espace « ${cloud.current.name} »` : " de ce navigateur"} ? Cette action est définitive.`))
      update((all) => all.filter((x) => x.id !== r.id));
  };

  const newButton = writable ? (
    limit ? (
      <Button variant="primary" disabled title={limit}>
        <Plus size={15} /> Nouveau registre
      </Button>
    ) : (
      <ButtonLink href="/registres/nouveau" variant="primary">
        <Plus size={15} /> Nouveau registre
      </ButtonLink>
    )
  ) : null;

  return (
    <div className={s.screen}>
      <PageHeader
        title="Registres"
        description="Les textes qui s’appliquent à chaque établissement, leur évaluation et leur suivi."
        actions={
          <>
            <Menu
              align="end"
              trigger={
                <Button icon aria-label="Sauvegarde des registres">
                  <MoreHorizontal size={16} />
                </Button>
              }
            >
              <MenuItem icon={<Download size={15} />} onSelect={() => download(backup(list), `registres_${today()}.json`, "application/json")}>
                Sauvegarder les registres (fichier)
              </MenuItem>
              {writable ? (
                <MenuItem icon={<Upload size={15} />} onSelect={() => fileRef.current?.click()}>
                  Restaurer une sauvegarde
                </MenuItem>
              ) : null}
            </Menu>
            {newButton}
          </>
        }
      />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void restoreFile(e.target.files?.[0]).then(() => (e.target.value = ""))} />
      <OffreBanner />
      <ReadOnlyNotice />
      <LocalImport />
      {!saved ? (
        <Notice tone="danger" title="Ce navigateur n’enregistre pas les registres">
          Navigation privée ou stockage bloqué : sauvegardez-les dans un fichier (menu ⋯).
        </Notice>
      ) : null}
      {limit ? <Notice tone="warning" title={limit} /> : null}
      {message ? <Notice title={message} /> : null}

      {!list.length ? (
        <Panel>
          <EmptyState
            icon={<Building2 size={20} />}
            title="Aucun registre pour l’instant"
            actions={
              <>
                <ButtonLink href="/classement">
                  <Search size={15} /> Classer un établissement
                </ButtonLink>
                {newButton}
              </>
            }
          >
            Classez un établissement et validez sa synthèse : les textes qui s’appliquent au site sont proposés d’office. Pour une entreprise que la nomenclature
            ne classe pas (bâtiment, travaux routiers, industrie, services), créez un registre et choisissez ses métiers.
          </EmptyState>
        </Panel>
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} ${table.stack}`}>
            <thead>
              <tr>
                <th>Établissement</th>
                <th>Évaluation</th>
                <th className={table.num}>Textes</th>
                <th className={table.num}>À traiter</th>
                <th className={table.num}>Mis à jour</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {etats.map((e) => {
                const metiers = metierLabels(e.reg.site);
                return (
                  <tr key={e.reg.id} data-href onClick={() => router.push(href(e.reg.id))}>
                    <td data-slot="main" className={s.etab}>
                      <Link href={href(e.reg.id)} className={table.primary} onClick={(ev) => ev.stopPropagation()}>
                        {e.reg.nom || "Sans nom"}
                      </Link>
                      <span className={table.secondary}>
                        {classLabel(e.reg.classe, e.reg.activites.length)}
                        {metiers.length ? ` · ${metiers.slice(0, 2).join(", ")}${metiers.length > 2 ? "…" : ""}` : ""}
                        {e.reg.etude ? ` · ${study(e.reg.etude, false).title}` : ""}
                      </span>
                    </td>
                    <td data-slot="meta">
                      <span className={s.progressCell}>
                        <Progress value={e.progress} label={`${e.progress} % évalué`} />
                        <span className="tabular">
                          {e.progress} %{e.taux !== null ? ` · ${e.taux} % conforme` : ""}
                        </span>
                      </span>
                    </td>
                    <td data-slot="hide" className={table.num}>
                      {e.retenus}
                    </td>
                    <td data-slot="side">
                      <span className={s.badges}>
                        {e.retard ? <Badge tone="danger">{e.retard} en retard</Badge> : null}
                        {e.nonConformes ? <Badge tone="danger">{e.nonConformes} NC</Badge> : null}
                        {e.aFaire ? <Badge tone="warning">{e.aFaire} à évaluer</Badge> : null}
                        {e.jort ? <Badge tone="accent">{e.jort} modifiés au JORT</Badge> : null}
                        {e.nouveaux ? <Badge tone="accent">{e.nouveaux} nouveaux</Badge> : null}
                        {aJour(e) ? (
                          <Badge tone="success" dot>
                            À jour
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td data-slot="hide" className={`${table.num} ${table.muted}`}>
                      {dateCourte(e.reg.maj.slice(0, 10))}
                    </td>
                    <td data-slot="hide" className={s.rowMenu} onClick={(ev) => ev.stopPropagation()}>
                      {writable ? (
                        <Menu
                          align="end"
                          trigger={
                            <Button variant="ghost" size="sm" icon aria-label={`Actions sur « ${e.reg.nom} »`}>
                              <MoreHorizontal size={15} />
                            </Button>
                          }
                        >
                          <MenuItem onSelect={() => router.push(href(e.reg.id))}>Ouvrir</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => remove(e.reg)}>
                            Supprimer
                          </MenuItem>
                        </Menu>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.foot}>
        {cloud.current
          ? `Les registres sont enregistrés dans l’espace « ${cloud.current.name} », pour tous ses membres. Le fichier de sauvegarde en garde une copie.`
          : "Les registres sont gardés dans ce navigateur : sauvegardez-les régulièrement (menu ⋯)."}
      </p>
    </div>
  );
}
