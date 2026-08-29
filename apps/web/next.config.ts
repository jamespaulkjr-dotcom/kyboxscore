import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so workspace packages and the hoisted
  // node_modules are copied into .next/standalone. Without this, tracing
  // starts at apps/web and the standalone server is missing @kyboxscore/*.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
};

export default nextConfig;
