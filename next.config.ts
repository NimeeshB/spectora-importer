import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploads are capped at 4 MB in lib/importer/xlsx.ts (Vercel's request limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
