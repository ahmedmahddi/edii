import type { NextConfig } from "next";

// The Supabase project the browser talks to (REST, auth, storage, Realtime), for the content
// security policy; nothing else is reached from the page but the site itself.
const supabase = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [u.origin, `${u.protocol === "http:" ? "ws" : "wss"}://${u.host}`];
  } catch {
    return [];
  }
})();
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; the development server also evaluates code.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase.join(" ")} https://*.supabase.co wss://*.supabase.co${dev ? " ws: http://localhost:*" : ""}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // The project root, even when a package-lock.json sits in a parent folder (Next.js would
  // otherwise take that folder as the workspace root and warn about it).
  outputFileTracingRoot: process.cwd(),
  // Files the server reads at run time (not public): the fiches, built before the build.
  outputFileTracingIncludes: { "/api/fiches": ["./data/build/fiches.json"], "/api/journal": ["./data/build/feed.json"] },
  // The page used to live at /edii inside the QMS app: keep old links working.
  async redirects() {
    return [{ source: "/edii", destination: "/", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
