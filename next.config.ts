import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for small Docker
  // images. better-sqlite3 is a native module, so it is kept external from the
  // bundle and copied from node_modules in the runtime image.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
