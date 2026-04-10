import type { NextConfig } from "next";

const fetcherTarget =
  process.env.FETCHER_PROXY_TARGET ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${fetcherTarget.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
