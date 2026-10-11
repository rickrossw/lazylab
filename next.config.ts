import type { NextConfig } from "next";

// GitHub Pages serves a project site from /<repo>/ unless a custom domain is set.
// The deploy workflow passes the correct base path (empty for a custom domain).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
