import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "9mb" },
  },
};

export default nextConfig;
