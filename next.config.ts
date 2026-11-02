import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent prompts are read from disk at runtime; make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**/*.md"],
  },
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
