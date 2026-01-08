# Mastra Practice - AI Workflow Application

このプロジェクトは、**Mastra**（AIワークフローフレームワーク）を使った実践的なアプリケーションです。

## 主な機能

### 1. 要件書→プロダクトバックログ自動生成

Confluence、Notion、Backlogから要件書を検索し、AIが分析してGitHub Issueを自動生成します。

**使用技術：**
- Mastraワークフロー
- Amazon Bedrock (Claude 3.5 Sonnet v2)
- Confluence/Notion/Backlog API
- GitHub API

### 2. Backlog課題Slack通知

納期の迫ったBacklog課題を取得し、Slackに自動通知します。

**使用技術：**
- Mastraワークフロー
- Backlog API
- Slack API

## セットアップ

### 1. 依存関係のインストール

\`\`\`bash
npm install
\`\`\`

### 2. 環境変数の設定

\`.env.local\`ファイルを作成し、必要な環境変数を設定してください：

\`\`\`bash
cp .env.example .env.local
\`\`\`

**必須の環境変数：**

\`\`\`
# Backlog課題通知に必要
BACKLOG_SPACE_ID=your-space-id
BACKLOG_API_KEY=your-api-key
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C01234567ABC

# AWS Bedrock（要件書→バックログ機能に必要）
BEDROCK_REGION=us-west-2

# GitHub（要件書→バックログ機能に必要）
GITHUB_TOKEN=ghp_your-token
\`\`\`

**オプションの環境変数：**

\`\`\`
# Confluence検索用
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_API_TOKEN=your-token
CONFLUENCE_USER_EMAIL=user@example.com

# Notion検索用
NOTION_API_TOKEN=secret_your-token
\`\`\`

### 3. 開発サーバーの起動

\`\`\`bash
npm run dev
\`\`\`

ブラウザで以下にアクセス：

- **要件書→バックログ**: http://localhost:3000
- **Backlog課題通知**: http://localhost:3000/backlog-notify

## Slack Bot の設定方法

Backlog課題通知機能を使用するには、Slack Botの作成が必要です。

1. https://api.slack.com/apps にアクセス
2. "Create New App" → "From scratch"
3. App名とWorkspaceを選択
4. **OAuth & Permissions**に移動
5. **Bot Token Scopes**に以下を追加：
   - \`chat:write\`
   - \`chat:write.public\`
6. **Install to Workspace**をクリック
7. 発行された**Bot User OAuth Token**を\`SLACK_BOT_TOKEN\`に設定
8. 通知したいチャンネルのIDを\`SLACK_CHANNEL_ID\`に設定

## Backlog API の設定方法

1. Backlogにログイン
2. 右上のアイコン → **個人設定**
3. **API**タブを開く
4. **API キーを発行**をクリック
5. 発行されたキーを\`BACKLOG_API_KEY\`に設定
6. スペースID（URLの\`https://xxx.backlog.jp\`の\`xxx\`部分）を\`BACKLOG_SPACE_ID\`に設定

## ビルドとデプロイ

\`\`\`bash
# プロダクションビルド
npm run build

# プロダクションサーバー起動
npm start
\`\`\`

## プロジェクト構成

\`\`\`
src/mastra/
├── index.ts                      # Mastraインスタンス
├── agents/
│   └── assistantAgent.ts        # AIエージェント（Bedrock Claude）
├── tools/
│   ├── githubTool.ts            # GitHub Issues作成
│   ├── confluenceTool.ts        # Confluence検索
│   ├── notionTool.ts            # Notion検索
│   ├── backlogTool.ts           # Backlog課題取得
│   └── slackTool.ts             # Slack通知
└── workflows/
    ├── handson.ts               # シンプルな要件書→GitHub
    ├── multiSourceWorkflow.ts   # マルチソース検索→GitHub
    └── backlogToSlackWorkflow.ts # Backlog→Slack通知
\`\`\`

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS 4
- **AIワークフロー**: Mastra
- **AI**: Amazon Bedrock (Claude 3.5 Sonnet v2)
- **認証**: AWS Amplify

## 詳細ドキュメント

開発に関する詳細情報は[CLAUDE.md](CLAUDE.md)を参照してください。

## ライセンス

MIT
