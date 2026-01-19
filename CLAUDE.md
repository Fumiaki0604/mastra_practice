# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application that demonstrates workflow automation using **Mastra** (an AI workflow framework). The application includes two main features:

1. **Requirements to Product Backlog**: Searches for requirements documents across multiple sources (Confluence, Notion, Backlog) and automatically generates GitHub Issues from them using AI agents.
2. **Backlog Task Notification**: Retrieves urgent Backlog tasks (based on due date threshold) and sends notifications to Slack.

## Key Technologies

- **Next.js 15** with App Router and React 19
- **Mastra Core** (`@mastra/core`) - AI workflow orchestration framework
- **AWS Amplify** - Authentication and backend infrastructure
- **Amazon Bedrock** - Claude 3.5 Sonnet v2 for AI generation
- **TypeScript** - Type safety throughout
- **Tailwind CSS 4** - Styling

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (with Turbopack)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Architecture

### Mastra Workflow System

The core of this application is built around Mastra workflows. All Mastra-related code lives in `src/mastra/`:

```
src/mastra/
├── index.ts                      # Mastra instance initialization
├── agents/
│   └── assistantAgent.ts        # AI agent using Bedrock Claude
├── tools/
│   ├── githubTool.ts            # GitHub Issues creation
│   ├── confluenceTool.ts        # Confluence API integration
│   ├── notionTool.ts            # Notion API integration
│   ├── backlogTool.ts           # Backlog API integration (urgent issues search)
│   └── slackTool.ts             # Slack notification
└── workflows/
    ├── handson.ts               # Simple Confluence → GitHub workflow
    ├── multiSourceWorkflow.ts   # Multi-source search workflow
    └── backlogToSlackWorkflow.ts # Backlog → Slack notification workflow
```

**Important workflow concepts:**
- Workflows are composed of **steps** created via `createStep()`
- Steps can be tools or custom functions with `execute()`
- Use `.then()` to chain steps sequentially
- Always call `.commit()` at the end of workflow definition
- Access initial workflow input via `getInitData()` in any step
- Workflows must define `inputSchema` and `outputSchema` using Zod

### Workflow Execution Flow

1. **Frontend** ([app/page.tsx](app/page.tsx)): User submits search query + GitHub repo details
2. **API Route** ([app/api/workflow/execute/route.ts](app/api/workflow/execute/route.ts)): Receives request and triggers Mastra workflow
3. **Workflow Steps**:
   - Generate search query (CQL for Confluence, native for others)
   - Search across selected sources (Confluence/Notion/Backlog)
   - Fetch page content from first result
   - AI agent analyzes content and generates 2 GitHub Issues
   - Create GitHub Issues via API
4. **Response**: Returns created issues and workflow status to frontend

### AWS Amplify Integration

- **Authentication**: Amplify Auth provides AWS credentials
- **Backend Setup**: [amplify/backend.ts](amplify/backend.ts) configures IAM role with Bedrock access
- **Credential Flow**: `lib/amplify-server-utils.ts` → `lib/aws-configs.ts` → Bedrock model initialization

The `getBedrockModel()` function in [lib/aws-configs.ts](lib/aws-configs.ts) retrieves temporary AWS credentials from Amplify Auth session to authenticate with Bedrock.

### Frontend Architecture

- **Client Components**: All UI components use `"use client"` directive
- **Main Page**: [app/page.tsx](app/page.tsx) manages form state and API calls
- **Components**: Separated into [app/components/](app/components/)
  - `WorkflowForm.tsx` - Input form
  - `WorkflowInstructions.tsx` - Usage instructions
  - `WorkflowResults.tsx` - Display results
  - `Navigation.tsx` - Top navigation

## Environment Variables Required

Create a `.env.local` file with:

```
# GitHub
GITHUB_TOKEN=ghp_xxxxx

# Confluence (optional, for Confluence search)
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_API_TOKEN=xxxxx
CONFLUENCE_USER_EMAIL=user@example.com

# Notion (optional, for Notion search)
NOTION_API_TOKEN=secret_xxxxx

# Backlog (required for Backlog課題通知)
# Default workspace
BACKLOG_SPACE_ID=your-space
BACKLOG_API_KEY=xxxxx

# Additional workspaces (optional, up to 10 total)
# BACKLOG_SPACE_ID_1=another-space
# BACKLOG_API_KEY_1=yyyyy
# BACKLOG_SPACE_ID_2=third-space
# BACKLOG_API_KEY_2=zzzzz

# Slack (required for Backlog課題通知)
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_CHANNEL_ID=C01234567ABC

# AWS Bedrock
BEDROCK_REGION=us-west-2
```

## Common Development Patterns

### Creating a New Tool

Tools in Mastra are reusable components. Example from [src/mastra/tools/githubTool.ts](src/mastra/tools/githubTool.ts):

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
    // Tool logic here
    return { result: "output" };
  }
});
```

### Creating a New Workflow

Workflows orchestrate multiple steps. Pattern from [src/mastra/workflows/handson.ts](src/mastra/workflows/handson.ts):

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
      // Access workflow initial input
      const initial = getInitData();
      // Step logic
      return { processed: inputData.data };
    }
  }))
  .commit();
```

### Using the AI Agent

The assistant agent ([src/mastra/agents/assistantAgent.ts](src/mastra/agents/assistantAgent.ts)) uses Bedrock Claude:

```typescript
import { assistantAgent } from "@/src/mastra/agents/assistantAgent";

// Text generation
const result = await assistantAgent.generateVNext(prompt);
const text = result.text;

// Structured output
const outputSchema = z.object({
  items: z.array(z.object({ title: z.string() }))
});
const result = await assistantAgent.generateVNext(prompt, {
  output: outputSchema
});
const parsed = JSON.parse(result.text);
```

### Adding a New API Endpoint

Follow the pattern in [app/api/workflow/execute/route.ts](app/api/workflow/execute/route.ts):

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validation

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

## Important Implementation Notes

- The Bedrock model is initialized **asynchronously** using `await getBedrockModel()` at the top level of [src/mastra/agents/assistantAgent.ts](src/mastra/agents/assistantAgent.ts). This requires top-level await.
- XState version is pinned to `^4.38.3` in package.json overrides due to Mastra compatibility.
- The `multiSourceWorkflow` is the primary workflow used in production (see [app/api/workflow/execute/route.ts](app/api/workflow/execute/route.ts:21)).
- All workflows generate exactly 2 GitHub Issues per execution as specified in the prompts.
- Error handling in workflows returns structured error messages rather than throwing, allowing graceful degradation.

## Testing Workflows

### Requirements to Product Backlog Workflow

1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Fill in the form:
   - **検索クエリ**: Search term (e.g., "AI features")
   - **GitHub Owner**: Your GitHub username
   - **Repository**: Target repo name
4. Click "ワークフロー実行" to execute

The workflow will search Confluence/Notion/Backlog, retrieve content, analyze it with Claude, and create GitHub Issues.

### Backlog Task Notification Workflow

1. Start dev server: `npm run dev`
2. Open http://localhost:3000/backlog-notify
3. Fill in the form:
   - **遅延日数の閾値**: Delay threshold in days (default: -1 = 1+ days overdue)
   - **SlackチャンネルID**: Optional Slack channel ID (uses env var if empty)
   - **平日のみ配信**: Checkbox to skip weekends/holidays (default: checked)
4. Click "Slackに通知" to execute

The workflow will:
- Retrieve all **overdue** Backlog issues from all projects across multiple workspaces
- Sort them by delay (most overdue first)
- Skip execution on weekends/holidays if enabled
- Send a formatted notification to the specified Slack channel
- Display issue key, summary, due date, days overdue, assignee, project, and status

## Production Deployment

### Vercel

This application is deployed to Vercel at: **https://mastra-practice.vercel.app/**

#### Deployment Steps

1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel Dashboard (Project Settings → Environment Variables)
3. Deploy automatically on git push to main branch

#### Critical Security Note

**Always use Next.js 15.3.8 or later.** Versions 15.3.4 and earlier have critical vulnerabilities:
- CVE-2025-66478 (Critical - Remote Code Execution)
- CVE-2025-55184 (High - DoS)
- CVE-2025-55183 (Medium - Source code exposure)
- CVE-2025-67779 (High - DoS)

To update Next.js:
```bash
npx fix-react2shell-next --fix
npm install
```

### GitHub Actions - Scheduled Notifications

A GitHub Actions workflow ([.github/workflows/backlog-notify.yml](.github/workflows/backlog-notify.yml)) automatically runs the Backlog notification every weekday at **7:30 AM JST** (22:30 UTC previous day).

**Workflow configuration:**
```yaml
on:
  schedule:
    - cron: '30 22 * * *'  # 7:30 AM JST daily
  workflow_dispatch:  # Manual execution also available
```

The workflow calls the Vercel production API:
```bash
curl -X POST https://mastra-practice.vercel.app/api/backlog-notify \
  -H "Content-Type: application/json" \
  -d '{
    "daysThreshold": -1,
    "skipWeekendHoliday": true
  }'
```

**Monitoring execution:**
1. Go to GitHub repository → Actions tab
2. Select "Backlog課題 定期通知" workflow
3. View execution history and logs

On weekends/holidays, the API returns:
```json
{
  "success": true,
  "message": "土日祝日のため通知をスキップしました",
  "skipped": true,
  "steps": []
}
```

## Backlog Notification System Details

### Multi-Workspace Support

The Backlog notification system can monitor up to **10 different Backlog workspaces** simultaneously. This is configured through environment variables following the pattern:
- `BACKLOG_SPACE_ID`, `BACKLOG_API_KEY` (default workspace)
- `BACKLOG_SPACE_ID_1`, `BACKLOG_API_KEY_1` (additional workspace 1)
- `BACKLOG_SPACE_ID_2`, `BACKLOG_API_KEY_2` (additional workspace 2)
- ... up to `BACKLOG_SPACE_ID_10`, `BACKLOG_API_KEY_10`

See [src/mastra/tools/backlogTool.ts:10-37](src/mastra/tools/backlogTool.ts) for implementation.

### Overdue Detection Logic

The system calculates days until due date using `getDaysUntilDue()` ([backlogTool.ts:54-61](src/mastra/tools/backlogTool.ts)):

```typescript
function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays; // Negative value = overdue
}
```

- **Positive value**: Still before due date (e.g., 3 = 3 days remaining)
- **Negative value**: Overdue (e.g., -5 = 5 days late)
- **Default threshold -1**: Notifies issues that are 1+ days overdue

### Weekday-Only Delivery (JST-based)

The API route ([app/api/backlog-notify/route.ts](app/api/backlog-notify/route.ts)) includes Japanese holiday detection with **JST timezone handling**.

**Important:** Since Vercel/GitHub Actions run in UTC, all date/time calculations use `getJSTDate()` to convert UTC to JST (+9 hours) before checking weekdays/holidays.

```typescript
// JST変換（サーバーがUTCで動作するため必須）
function getJSTDate(): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + jstOffset);
}
```

**Fixed holidays checked:**
- January 1 (元日), February 11 (建国記念の日), February 23 (天皇誕生日)
- April 29 (昭和の日), May 3-5 (GW), August 11 (山の日)
- November 3 (文化の日), November 23 (勤労感謝の日)

When `skipWeekendHoliday: true` (default), notifications are skipped on weekends and Japanese holidays.

### Workflow Steps

The `backlogToSlackWorkflow` ([src/mastra/workflows/backlogToSlackWorkflow.ts](src/mastra/workflows/backlogToSlackWorkflow.ts)) executes in 3 steps:

1. **fetch-backlog-issues**: Calls `backlogSearchUrgentIssuesTool` to retrieve overdue issues from all configured workspaces
2. **prepare-slack-notification**: Transforms the issue data and adds the `channelId` from initial input
3. **Slack送信**: Calls `slackNotifyUrgentIssuesTool` to post formatted message to Slack

Issues are sorted by `daysUntilDue` (most overdue first) before being sent to Slack.

## Debugging

- Workflow execution logs appear in the terminal running `npm run dev`
- Check browser DevTools Network tab for API response details
- Workflow results include a `steps` array showing status of each step
- For Bedrock issues, verify AWS credentials via Amplify Auth console
- For GitHub Actions issues, check the Actions tab logs in the repository
