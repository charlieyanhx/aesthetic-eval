import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "aesthetic-eval",
    "cheerio",
    "css-tree",
    "playwright",
    "axe-core",
  ],
};

export default nextConfig;
