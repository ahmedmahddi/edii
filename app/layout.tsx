import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/legacy.css";

export const metadata: Metadata = {
  title: "ABClassement | ABC Consulting",
  description:
    "Classement des établissements dangereux, insalubres ou incommodes (Tunisie), registres réglementaires et veille du Journal officiel",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
  ],
};

// The appearance chosen in the app (light, dark, or the system's), set before the page paints so
// that it never flashes in the other theme.
const theme = `try{var t=localStorage.getItem("abclassement-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
