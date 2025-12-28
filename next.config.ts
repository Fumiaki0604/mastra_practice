import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastraを外部パッケージとして設定
  serverExternalPackages: ["@mastra/*"],
  // xstateのESM/CommonJS互換性の問題を解決
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['xstate'],
  },
}

export default nextConfig;