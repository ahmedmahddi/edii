"use client";
/**
 * The frame of every screen once signed in: a side menu on desktop (workspace, navigation, search,
 * account), a top bar and a tab bar on phones, and the command palette (Ctrl+K).
 */
import { Bell, Building2, ChevronsUpDown, FileText, Home, LayoutList, LogOut, Moon, Plus, Search, Settings, ShieldCheck, Sun, SunMoon, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useCloud } from "@/app/components/cloud";
import { useVeilleCount } from "@/app/components/veille-count";
import { Badge, Button, Kbd, Menu, MenuItem, MenuLabel, MenuSeparator } from "@/app/ui";
import { ROLE_LABEL } from "@/lib/cloud/api";
import { CommandPalette } from "./CommandPalette";
import s from "./Shell.module.css";
import { type Theme, useTheme } from "@/app/ui";

const NAV = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/registres", label: "Registres", icon: LayoutList },
  { href: "/veille", label: "Veille", icon: Bell },
  { href: "/classement", label: "Classement", icon: Building2 },
];

const initial = (s: string | null | undefined) => (s?.trim()[0] ?? "?").toUpperCase();

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const cloud = useCloud();
  const count = useVeilleCount();
  const [palette, setPalette] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const account = cloud.name || cloud.user?.email || "";
  const themeItems: [Theme, string, ReactNode][] = [
    ["auto", "Automatique", <SunMoon key="a" size={15} />],
    ["light", "Clair", <Sun key="l" size={15} />],
    ["dark", "Sombre", <Moon key="d" size={15} />],
  ];

  const workspaceMenu = cloud.current ? (
    <Menu
      trigger={
        <button type="button" className={s.workspace} aria-label="Changer d’espace de travail">
          <span className={s.mark}>{initial(cloud.current.name)}</span>
          <span className={s.workspaceText}>
            <span className={s.workspaceName}>{cloud.current.name}</span>
            <span className={s.workspaceMeta}>
              {ROLE_LABEL[cloud.current.role]}
              {cloud.sync.state === "saving" ? " · enregistrement…" : cloud.sync.state === "error" ? " · non enregistré" : ""}
            </span>
          </span>
          <ChevronsUpDown size={14} color="var(--ui-text-subtle)" />
        </button>
      }
    >
      <MenuLabel>Espaces de travail</MenuLabel>
      {cloud.workspaces.map((w) => (
        <MenuItem key={w.id} checked={w.id === cloud.current?.id} onSelect={() => void cloud.switchTo(w.id)}>
          {w.name}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Users size={15} />} onSelect={() => router.push("/equipe")}>
        Équipe et espace
      </MenuItem>
      <MenuItem icon={<Plus size={15} />} onSelect={() => router.push("/equipe#nouvel-espace")}>
        Créer un espace
      </MenuItem>
    </Menu>
  ) : (
    <div className={s.workspace}>
      <span className={s.mark}>A</span>
      <span className={s.workspaceText}>
        <span className={s.workspaceName}>ABClassement</span>
        <span className={s.workspaceMeta}>Mode local</span>
      </span>
    </div>
  );

  const accountMenu = (trigger: ReactNode) => (
    <Menu trigger={trigger} align="start" side="top">
      {cloud.user ? <MenuLabel>{cloud.user.email}</MenuLabel> : null}
      {cloud.user ? (
        <MenuItem icon={<User size={15} />} onSelect={() => router.push("/compte")}>
          Mon compte
        </MenuItem>
      ) : null}
      <MenuLabel>Apparence</MenuLabel>
      {themeItems.map(([t, label, icon]) => (
        <MenuItem key={t} icon={icon} checked={theme === t} onSelect={() => setTheme(t)}>
          {label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<FileText size={15} />} onSelect={() => router.push("/cgu")}>
        Conditions et confidentialité
      </MenuItem>
      {cloud.user ? (
        <MenuItem icon={<LogOut size={15} />} onSelect={() => void cloud.signOut()}>
          Se déconnecter
        </MenuItem>
      ) : null}
    </Menu>
  );

  return (
    <div className={s.app}>
      <aside className={s.sidebar} aria-label="Menu">
        {workspaceMenu}
        <button type="button" className={s.search} onClick={() => setPalette(true)}>
          <Search size={14} />
          <span>Rechercher…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <nav aria-label="Navigation principale" style={{ display: "grid", gap: 2 }}>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={s.navItem} aria-current={current(href) ? "page" : undefined}>
              <Icon size={16} />
              <span>{label}</span>
              {href === "/registres" && count > 0 ? (
                <Badge tone="danger" count title="Textes modifiés au JORT, évaluations en retard ou à faire sous 30 jours">
                  {count}
                </Badge>
              ) : null}
            </Link>
          ))}
          {cloud.enabled ? (
            <>
              <span className={s.navLabel}>Espace</span>
              <Link href="/equipe" className={s.navItem} aria-current={current("/equipe") ? "page" : undefined}>
                <Users size={16} />
                <span>Équipe</span>
              </Link>
            </>
          ) : null}
          {cloud.isAdmin ? (
            <>
              <span className={s.navLabel}>ABC Consulting</span>
              <Link href="/admin" className={s.navItem} aria-current={current("/admin") ? "page" : undefined}>
                <ShieldCheck size={16} />
                <span>Administration</span>
              </Link>
            </>
          ) : null}
        </nav>
        <div className={s.foot}>
          {accountMenu(
            <button type="button" className={s.workspace} aria-label="Compte et apparence">
              <span className={s.avatar}>{initial(account || "A")}</span>
              <span className={s.workspaceText}>
                <span className={s.workspaceName}>{cloud.name || (cloud.user ? cloud.user.email : "Réglages")}</span>
                {cloud.user && cloud.name ? <span className={s.workspaceMeta}>{cloud.user.email}</span> : null}
              </span>
              <Settings size={14} color="var(--ui-text-subtle)" />
            </button>,
          )}
          {!cloud.enabled ? <p className={s.local}>Mode local : les registres restent dans ce navigateur.</p> : null}
          <div className={s.brand}>ABClassement · ABC Consulting</div>
        </div>
      </aside>

      <header className={s.topbar}>
        <div className={s.topbarTitle}>{workspaceMenu}</div>
        <Button variant="ghost" icon aria-label="Rechercher" onClick={() => setPalette(true)}>
          <Search size={18} />
        </Button>
        {accountMenu(
          <Button variant="ghost" icon aria-label="Compte et apparence">
            <span className={s.avatar}>{initial(account || "A")}</span>
          </Button>,
        )}
      </header>

      <main id="contenu" className={s.main}>
        {children}
      </main>

      <nav className={s.tabbar} aria-label="Navigation">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={s.tab} aria-current={current(href) ? "page" : undefined}>
            <Icon size={20} />
            <span>{label}</span>
            {href === "/registres" && count > 0 ? (
              <span className={s.tabBadge}>
                <Badge tone="danger" count>
                  {count}
                </Badge>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <CommandPalette open={palette} onOpenChange={setPalette} theme={setTheme} />
    </div>
  );
}
