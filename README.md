# Mastra Practice - AI Workflow Application

このプロジェクトは、**Mastra**（AIワークフローフレームワーク）を使った実践的なアプリケーションです。

## 主な機能

### 1. 要件書→プロダクトバックログ自動生成

Confluence、Notion、Backlogから要件書を検索し、AIが分析してGitHub Issueを自動生成します。

### 2. Backlog課題Slack通知

納期の迫ったBacklog課題を取得し、Slackに自動通知します。

## 技術スタック

- **Next.js 15** with App Router and React 19
- **Mastra Core** (`@mastra/core`) - AI workflow orchestration framework
- **AWS Amplify** - Authentication and backend infrastructure
- **Amazon Bedrock** - Claude 3.5 Sonnet v2 for AI generation
- **TypeScript** - Type safety throughout
- **Tailwind CSS 4** - Styling

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成：

```bash
cp .env.example .env.local
```

**必須の環境変数：**

```
# GitHub
GITHUB_TOKEN=ghp_xxxxx

# Backlog (required for Backlog課題通知)
# Default workspace
BACKLOG_SPACE_ID=your-space
BACKLOG_API_KEY=xxxxx

# Additional workspaces (optional, up to 10 total)
# BACKLOG_SPACE_ID_1=another-space
# BACKLOG_API_KEY_1=yyyyy

# Slack (required for Backlog課題通知)
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_CHANNEL_ID=C01234567ABC

# AWS Bedrock
BEDROCK_REGION=us-west-2
```

**オプションの環境変数：**

```
# Confluence検索用
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_API_TOKEN=xxxxx
CONFLUENCE_USER_EMAIL=user@example.com

# Notion検索用
NOTION_API_TOKEN=secret_xxxxx
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで以下にアクセス：

- **要件書→バックログ**: http://localhost:3000
- **Backlog課題通知**: http://localhost:3000/backlog-notify

## 開発コマンド

```bash
npm install      # 依存関係インストール
npm run dev      # 開発サーバー起動（Turbopack）
npm run build    # プロダクションビルド
npm start        # プロダクションサーバー起動
npm run lint     # Linter実行
```

## アーキテクチャ

### プロジェクト構成

```
src/mastra/
├── index.ts                      # Mastraインスタンス初期化
├── agents/
│   └── assistantAgent.ts        # AIエージェント（Bedrock Claude）
├── tools/
│   ├── githubTool.ts            # GitHub Issues作成
│   ├── confluenceTool.ts        # Confluence API連携
│   ├── notionTool.ts            # Notion API連携
│   ├── backlogTool.ts           # Backlog API連携
│   └── slackTool.ts             # Slack通知
└── workflows/
    ├── handson.ts               # シンプルな要件書→GitHub
    ├── multiSourceWorkflow.ts   # マルチソース検索→GitHub
    └── backlogToSlackWorkflow.ts # Backlog→Slack通知
```

### Mastraワークフローの基本概念

- `createStep()`でステップを作成
- ツールまたはカスタム関数を`execute()`で定義
- `.then()`で順次チェーン
- 最後に`.commit()`を呼び出す
- `getInitData()`で初期入力にアクセス
- `inputSchema`/`outputSchema`はZodで定義

### ワークフロー実行フロー

1. **Frontend** ([app/page.tsx](app/page.tsx)): 検索クエリ+GitHubリポジトリ情報を送信
2. **API Route** ([app/api/workflow/execute/route.ts](app/api/workflow/execute/route.ts)): リクエスト受信、Mastraワークフロー実行
3. **Workflow Steps**:
   - 検索クエリ生成（Confluence用CQL等）
   - 複数ソース検索（Confluence/Notion/Backlog）
   - コンテンツ取得
   - AIエージェントが分析しGitHub Issues生成
   - GitHub Issues作成
4. **Response**: 作成されたIssuesとステータスを返却

### AWS Amplify連携

- **Authentication**: Amplify AuthでAWS認証情報を提供
- **Backend Setup**: [amplify/backend.ts](amplify/backend.ts)でIAMロール+Bedrockアクセス設定
- **Credential Flow**: `lib/amplify-server-utils.ts` → `lib/aws-configs.ts` → Bedrockモデル初期化

`getBedrockModel()`関数（[lib/aws-configs.ts](lib/aws-configs.ts)）がAmplify Authセッションから一時的なAWS認証情報を取得。

### フロントエンドアーキテクチャ

- 全UIコンポーネントは`"use client"`ディレクティブを使用
- **Main Page**: [app/page.tsx](app/page.tsx)でフォーム状態とAPI呼び出しを管理
- **Components**: [app/components/](app/components/)
  - `WorkflowForm.tsx` - 入力フォーム
  - `WorkflowInstructions.tsx` - 使用方法
  - `WorkflowResults.tsx` - 結果表示
  - `Navigation.tsx` - ナビゲーション

## 開発パターン

### 新しいToolの作成

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const myTool = createTool({
  id: "myTool",
  description: "What this tool does",
  inputSchema: z.object({
    param: z.string().describe("Parameter description")
  }),
  outputSchema: z.object({
    result: z.string()
  }),
  execute: async ({ context }) => {
    const { param } = context;
    return { result: "output" };
  }
});
```

### 新しいWorkflowの作成

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const myWorkflow = createWorkflow({
  id: "myWorkflow",
  description: "Workflow description",
  inputSchema: z.object({ input: z.string() }),
  outputSchema: z.object({ output: z.string() })
})
  .then(createStep(someTool))
  .then(createStep({
    id: "custom-step",
    inputSchema: z.object({ data: z.string() }),
    outputSchema: z.object({ processed: z.string() }),
    execute: async ({ inputData, getInitData }) => {
      const initial = getInitData();
      return { processed: inputData.data };
    }
  }))
  .commit();
```

### AIエージェントの使用

```typescript
import { assistantAgent } from "@/src/mastra/agents/assistantAgent";

// テキスト生成
const result = await assistantAgent.generateVNext(prompt);
const text = result.text;

// 構造化出力
const outputSchema = z.object({
  items: z.array(z.object({ title: z.string() }))
});
const result = await assistantAgent.generateVNext(prompt, {
  output: outputSchema
});
const parsed = JSON.parse(result.text);
```

### 新しいAPIエンドポイントの追加

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { mastra } = await import("@/src/mastra");
    const workflow = mastra.getWorkflow("workflowId");

    const run = await workflow.createRunAsync();
    const result = await run.start({ inputData: body });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: "message" }, { status: 500 });
  }
}
```

## 実装上の注意点

- Bedrockモデルは[src/mastra/agents/assistantAgent.ts](src/mastra/agents/assistantAgent.ts)のトップレベルで`await getBedrockModel()`を使用して**非同期初期化**
- XStateバージョンはMastra互換性のためpackage.jsonのoverridesで`^4.38.3`に固定
- `multiSourceWorkflow`が本番で使用されるメインワークフロー
- 全ワークフローは実行ごとに2つのGitHub Issuesを生成
- ワークフローのエラーハンドリングはthrowではなく構造化されたエラーメッセージを返却

## テスト方法

### 要件書→プロダクトバックログ

1. `npm run dev`で開発サーバー起動
2. http://localhost:3000 を開く
3. フォーム入力：
   - **検索クエリ**: 検索語（例：「AI機能」）
   - **GitHub Owner**: GitHubユーザー名
   - **Repository**: 対象リポジトリ名
4. 「ワークフロー実行」をクリック

### Backlog課題通知

1. `npm run dev`で開発サーバー起動
2. http://localhost:3000/backlog-notify を開く
3. フォーム入力：
   - **遅延日数の閾値**: 遅延閾値（デフォルト: -1 = 1日以上遅延）
   - **SlackチャンネルID**: 省略時は環境変数を使用
   - **平日のみ配信**: 土日祝日スキップ（デフォルト: オン）
4. 「Slackに通知」をクリック

## 本番デプロイ

### Vercel

**デプロイURL**: https://mastra-practice.vercel.app/

**手順：**
1. GitHubリポジトリをVercelに接続
2. Vercel Dashboard（Project Settings → Environment Variables）で環境変数設定
3. mainブランチへのpushで自動デプロイ

**セキュリティ注意**: Next.js 15.3.8以降を使用すること。15.3.4以前には重大な脆弱性あり：
- CVE-2025-66478 (Critical - RCE)
- CVE-2025-55184 (High - DoS)
- CVE-2025-55183 (Medium - Source code exposure)
- CVE-2025-67779 (High - DoS)

```bash
npx fix-react2shell-next --fix
npm install
```

### GitHub Actions - 定期通知

[.github/workflows/backlog-notify.yml](.github/workflows/backlog-notify.yml)で毎平日**7:30 AM JST**（前日22:30 UTC）に自動実行。

```yaml
on:
  schedule:
    - cron: '30 22 * * *'  # 7:30 AM JST daily
  workflow_dispatch:  # 手動実行も可能
```

土日祝日はスキップ：
```json
{
  "success": true,
  "message": "土日祝日のため通知をスキップしました",
  "skipped": true
}
```

## Backlog通知システム詳細

### マルチワークスペース対応

最大**10個のBacklogワークスペース**を同時監視可能：
- `BACKLOG_SPACE_ID`, `BACKLOG_API_KEY`（デフォルト）
- `BACKLOG_SPACE_ID_1`, `BACKLOG_API_KEY_1`（追加1）
- ...最大 `BACKLOG_SPACE_ID_10`

実装: [src/mastra/tools/backlogTool.ts:10-37](src/mastra/tools/backlogTool.ts)

### 遅延検出ロジック

```typescript
function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays; // 負の値 = 遅延
}
```

- **正の値**: 期限前（例：3 = 残り3日）
- **負の値**: 遅延（例：-5 = 5日遅延）
- **デフォルト閾値 -1**: 1日以上遅延の課題を通知

### 平日のみ配信（JSTベース）

Vercel/GitHub ActionsはUTCで動作するため、`getJSTDate()`でJST変換後に平日/祝日判定：

```typescript
function getJSTDate(): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + jstOffset);
}
```

**判定対象の祝日：**
元日、建国記念の日、天皇誕生日、昭和の日、GW（5/3-5）、山の日、文化の日、勤労感謝の日

### ワークフローステップ

[src/mastra/workflows/backlogToSlackWorkflow.ts](src/mastra/workflows/backlogToSlackWorkflow.ts):

1. **fetch-backlog-issues**: 全設定ワークスペースから遅延課題取得
2. **prepare-slack-notification**: データ変換、channelId追加
3. **Slack送信**: フォーマット済みメッセージをSlackに投稿

課題は`daysUntilDue`でソート（遅延が大きい順）。

## Slack Bot設定

1. https://api.slack.com/apps にアクセス
2. "Create New App" → "From scratch"
3. App名とWorkspaceを選択
4. **OAuth & Permissions**に移動
5. **Bot Token Scopes**に追加：
   - `chat:write`
   - `chat:write.public`
6. **Install to Workspace**をクリック
7. **Bot User OAuth Token**を`SLACK_BOT_TOKEN`に設定
8. チャンネルIDを`SLACK_CHANNEL_ID`に設定

## Backlog API設定

1. Backlogにログイン
2. 右上のアイコン → **個人設定**
3. **API**タブを開く
4. **API キーを発行**をクリック
5. 発行されたキーを`BACKLOG_API_KEY`に設定
6. スペースID（URLの`https://xxx.backlog.jp`の`xxx`部分）を`BACKLOG_SPACE_ID`に設定

## デバッグ

- ワークフロー実行ログは`npm run dev`実行中のターミナルに表示
- ブラウザDevTools NetworkタブでAPIレスポンス確認
- ワークフロー結果の`steps`配列で各ステップの状態確認
- Bedrock問題はAmplify Auth consoleでAWS認証情報を確認
- GitHub Actions問題はリポジトリのActionsタブでログ確認

## ライセンス

MIT
