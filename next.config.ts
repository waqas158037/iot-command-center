import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is authenticated and per-user, so we render dynamically
  // instead of opting into Cache Components / partial prerendering.
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pino"],
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
