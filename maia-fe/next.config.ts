import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed for the Docker deploy (see Dockerfile): produces .next/standalone,
  // a self-contained bundle with only the modules used at runtime.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
