import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 複数のBacklogスペースを定義
interface BacklogSpace {
  spaceId: string;
  apiKey: string;
}

function getBacklogSpaces(): BacklogSpace[] {
  const spaces: BacklogSpace[] = [];

  // 環境変数から複数のスペース設定を読み込む
  // BACKLOG_SPACE_ID, BACKLOG_API_KEY（デフォルト）
  // BACKLOG_SPACE_ID_1, BACKLOG_API_KEY_1（追加1）
  // BACKLOG_SPACE_ID_2, BACKLOG_API_KEY_2（追加2）
  // ...

  const defaultSpaceId = process.env.BACKLOG_SPACE_ID;
  const defaultApiKey = process.env.BACKLOG_API_KEY;

  if (defaultSpaceId && defaultApiKey) {
    spaces.push({ spaceId: defaultSpaceId, apiKey: defaultApiKey });
  }

  // 追加のスペース設定を読み込む（最大10個まで）
  for (let i = 1; i <= 10; i++) {
    const spaceId = process.env[`BACKLOG_SPACE_ID_${i}`];
    const apiKey = process.env[`BACKLOG_API_KEY_${i}`];

    if (spaceId && apiKey) {
      spaces.push({ spaceId, apiKey });
    }
  }

  return spaces;
}

function getBacklogBaseUrl(spaceId: string): string {
  return `https://${spaceId}.backlog.jp/api/v2`;
}

async function callBacklogAPI(spaceId: string, apiKey: string, endpoint: string): Promise<any> {
  const baseUrl = getBacklogBaseUrl(spaceId);
  const url = `${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Backlog API error: ${response.status}`);
  }
  return response.json();
}

// 日付の差分を計算（日数）
function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Backlog 課題検索ツール（納期の迫っている課題）
export const backlogSearchUrgentIssuesTool = createTool({
  id: "backlog-search-urgent-issues",
  description: "Backlogで納期の迫っている課題をプロジェクト横断で検索します",
  inputSchema: z.object({
    daysThreshold: z.number().optional().default(-1).describe("期限までの日数の閾値（デフォルト-1: 納期が1日以上過ぎた課題）"),
    statusIds: z.array(z.number()).optional().describe("検索対象のステータスID（省略時は未完了のみ）"),
  }),
  outputSchema: z.object({
    issues: z.array(
      z.object({
        id: z.string().describe("課題のID"),
        key: z.string().describe("課題キー"),
        summary: z.string().describe("課題の件名"),
        dueDate: z.string().optional().describe("期限日"),
        daysUntilDue: z.number().optional().describe("期限までの残り日数"),
        priority: z.string().describe("優先度"),
        status: z.string().describe("ステータス"),
        assignee: z.string().optional().describe("担当者名"),
        projectName: z.string().describe("プロジェクト名"),
        url: z.string().describe("課題のURL"),
      })
    ),
    total: z.number().describe("検索結果の総数"),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      const spaces = getBacklogSpaces();

      if (spaces.length === 0) {
        return { issues: [], total: 0, error: "Backlog API設定が不足しています" };
      }

      const allIssues: any[] = [];

      // 各スペースから課題を取得
      for (const space of spaces) {
        try {
          // 全プロジェクトを取得
          const projects = await callBacklogAPI(space.spaceId, space.apiKey, "/projects");

          if (!projects || projects.length === 0) {
            console.warn(`スペース ${space.spaceId}: プロジェクトが見つかりません`);
            continue;
          }

          // 各プロジェクトから課題を取得
          for (const project of projects) {
            try {
              // 未完了の課題のみ取得（statusId[]=1,2,3など、完了以外）
              const issues = await callBacklogAPI(
                space.spaceId,
                space.apiKey,
                `/issues?projectId[]=${project.id}&statusId[]=1&statusId[]=2&statusId[]=3&count=100`
              );

              issues.forEach((issue: any) => {
                if (issue.dueDate) {
                  const daysUntil = getDaysUntilDue(issue.dueDate);
                  // 納期が過ぎている課題のみ（daysUntilが負の値）
                  // thresholdが-1の場合、1日以上遅延している課題を取得
                  if (daysUntil <= context.daysThreshold) {
                    allIssues.push({
                      ...issue,
                      projectName: project.name,
                      daysUntilDue: daysUntil,
                      spaceId: space.spaceId, // スペースIDを追加
                    });
                  }
                }
              });
            } catch (err) {
              console.error(`Error fetching issues for project ${project.name}:`, err);
            }
          }
        } catch (err) {
          console.error(`Error fetching projects for space ${space.spaceId}:`, err);
        }
      }

      // 期限が近い順にソート
      allIssues.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

      const formattedIssues = allIssues.map((issue) => ({
        id: String(issue.id),
        key: issue.issueKey,
        summary: issue.summary,
        dueDate: issue.dueDate,
        daysUntilDue: issue.daysUntilDue,
        priority: issue.priority?.name || "未設定",
        status: issue.status?.name || "不明",
        assignee: issue.assignee?.name || "未割り当て",
        projectName: issue.projectName,
        url: `https://${issue.spaceId}.backlog.jp/view/${issue.issueKey}`,
      }));

      return { issues: formattedIssues, total: formattedIssues.length };
    } catch (error) {
      return { issues: [], total: 0, error: String(error) };
    }
  },
});

// Note: Wiki関連のツールは削除しました（複数スペース対応が不要なため）
