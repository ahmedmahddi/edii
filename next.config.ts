import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The project root, even when a package-lock.json sits in a parent folder (Next.js would
  // otherwise take that folder as the workspace root and warn about it).
  outputFileTracingRoot: process.cwd(),
  // The page used to live at /edii inside the QMS app: keep old links working.
  async redirects() {
    return [{ source: "/edii", destination: "/", permanent: true }];
  },
};

export default nextConfig;
