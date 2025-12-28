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
  // 環境変数を明示的に設定（サーバーサイドで利用可能にする）
  env: {
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,
    CONFLUENCE_USER_EMAIL: process.env.CONFLUENCE_USER_EMAIL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NOTION_API_TOKEN: process.env.NOTION_API_TOKEN,
    BACKLOG_SPACE_ID: process.env.BACKLOG_SPACE_ID,
    BACKLOG_API_KEY: process.env.BACKLOG_API_KEY,
  },
}

export default nextConfig;