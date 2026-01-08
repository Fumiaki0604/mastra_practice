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
BACKLOG_SPACE_ID=your-space
BACKLOG_API_KEY=xxxxx

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
   - **納期の閾値（日数）**: Number of days threshold (default: 3)
   - **SlackチャンネルID**: Optional Slack channel ID (uses env var if empty)
4. Click "Slackに通知" to execute

The workflow will:
- Retrieve all Backlog issues from all projects with due dates within the threshold
- Sort them by urgency (closest due date first)
- Send a formatted notification to the specified Slack channel
- Display issue key, summary, due date, assignee, project, and status

## Debugging

- Workflow execution logs appear in the terminal running `npm run dev`
- Check browser DevTools Network tab for API response details
- Workflow results include a `steps` array showing status of each step
- For Bedrock issues, verify AWS credentials via Amplify Auth console
