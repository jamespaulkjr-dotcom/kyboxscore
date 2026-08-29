import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so workspace packages and the hoisted
  // node_modules are copied into .next/standalone.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  async headers() {
    return [
      {
        // Brand marks are immutable; the filename changes when the art does.
        source: "/brand/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
