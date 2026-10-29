import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed for the Docker deploy (see Dockerfile): produces .next/standalone,
  // a self-contained bundle with only the modules used at runtime.
  output: "standalone",
  // Dev only: lets phones and TVs on the home Wi-Fi load the dev scripts when
  // opening http://<PC IP>:3001. Without it the page renders but nothing reacts.
  allowedDevOrigins: ["192.168.1.*"],
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
