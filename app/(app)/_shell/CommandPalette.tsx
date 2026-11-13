"use client";
/** Ctrl+K: go to any screen or register, start an action, change the appearance. */
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Bell, Building2, FileText, Home, LayoutList, Moon, Plus, Search, ShieldCheck, Sun, SunMoon, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import type { Registre } from "@/lib/registre/registre";
import { registres as store } from "@/lib/registre/store";
import s from "./CommandPalette.module.css";
import type { Theme } from "@/app/ui";

export function CommandPalette({ open, onOpenChange, theme }: { open: boolean; onOpenChange: (o: boolean) => void; theme: (t: Theme) => void }) {
  const router = useRouter();
  const cloud = useCloud();
  const [registres, setRegistres] = useState<Registre[]>([]);
  useEffect(() => {
    if (open) setRegistres(store.get());
  }, [open]);
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  const go = (href: string) => run(() => router.push(href));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.dialog} aria-describedby={undefined}>
          <Dialog.Title className="visually-hidden">Rechercher</Dialog.Title>
          <Command label="Rechercher" loop>
            <Command.Input className={s.input} placeholder="Aller à un registre, un écran, une action…" />
            <Command.List className={s.list}>
              <Command.Empty>Aucun résultat.</Command.Empty>
              {registres.length ? (
                <Command.Group heading="Registres">
                  {registres.map((r) => (
                    <Command.Item key={r.id} value={`registre ${r.nom} ${r.id}`} onSelect={go(`/registres/${encodeURIComponent(r.id)}`)}>
                      <LayoutList size={15} />
                      {r.nom || "Sans nom"}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Actions">
                <Command.Item value="nouveau registre sans classement" onSelect={go("/registres/nouveau")}>
                  <Plus size={15} />
                  Nouveau registre
                </Command.Item>
                <Command.Item value="classer un établissement nomenclature rubrique" onSelect={go("/classement")}>
                  <Search size={15} />
                  Classer un établissement
                </Command.Item>
                <Command.Item value="vérifier le journal officiel jort" onSelect={go("/veille")}>
                  <Bell size={15} />
                  Vérifier le Journal officiel
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Aller à">
                <Command.Item value="accueil" onSelect={go("/")}>
                  <Home size={15} />
                  Accueil
                </Command.Item>
                <Command.Item value="registres" onSelect={go("/registres")}>
                  <LayoutList size={15} />
                  Registres
                </Command.Item>
                <Command.Item value="veille réglementaire journal" onSelect={go("/veille")}>
                  <Bell size={15} />
                  Veille réglementaire
                </Command.Item>
                <Command.Item value="classement nomenclature établissement" onSelect={go("/classement")}>
                  <Building2 size={15} />
                  Classement
                </Command.Item>
                {cloud.enabled ? (
                  <>
                    <Command.Item value="équipe espace membres invitations" onSelect={go("/equipe")}>
                      <Users size={15} />
                      Équipe et espace
                    </Command.Item>
                    <Command.Item value="mon compte mot de passe" onSelect={go("/compte")}>
                      <User size={15} />
                      Mon compte
                    </Command.Item>
                  </>
                ) : null}
                {cloud.isAdmin ? (
                  <Command.Item value="administration clients signalements" onSelect={go("/admin")}>
                    <ShieldCheck size={15} />
                    Administration
                  </Command.Item>
                ) : null}
                <Command.Item value="conditions générales confidentialité" onSelect={go("/cgu")}>
                  <FileText size={15} />
                  Conditions et confidentialité
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Apparence">
                <Command.Item value="apparence automatique" onSelect={run(() => theme("auto"))}>
                  <SunMoon size={15} />
                  Automatique
                </Command.Item>
                <Command.Item value="apparence clair" onSelect={run(() => theme("light"))}>
                  <Sun size={15} />
                  Clair
                </Command.Item>
                <Command.Item value="apparence sombre" onSelect={run(() => theme("dark"))}>
                  <Moon size={15} />
                  Sombre
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
