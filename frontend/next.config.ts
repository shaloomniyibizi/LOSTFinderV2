import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build a small self-contained server (used by the Docker image, see Dockerfile)
  output: "standalone",
};

export default nextConfig;
