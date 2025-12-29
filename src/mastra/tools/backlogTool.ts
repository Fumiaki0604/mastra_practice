import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const BACKLOG_SPACE_ID = process.env.BACKLOG_SPACE_ID || "";
const BACKLOG_API_KEY = process.env.BACKLOG_API_KEY || "";

function getBacklogBaseUrl(): string {
  return `https://${BACKLOG_SPACE_ID}.backlog.jp/api/v2`;
}

async function callBacklogAPI(endpoint: string): Promise<any> {
  const url = `${getBacklogBaseUrl()}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${BACKLOG_API_KEY}`;
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
    daysThreshold: z.number().optional().default(14).describe("期限までの日数の閾値（デフォルト14日）"),
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
      if (!BACKLOG_SPACE_ID || !BACKLOG_API_KEY) {
        return { issues: [], total: 0, error: "Backlog API設定が不足しています" };
      }

      // 全プロジェクトを取得
      const projects = await callBacklogAPI("/projects");

      if (!projects || projects.length === 0) {
        return { issues: [], total: 0, error: "プロジェクトが見つかりません" };
      }

      const allIssues: any[] = [];

      // 各プロジェクトから課題を取得
      for (const project of projects) {
        try {
          // 未完了の課題のみ取得（statusId[]=1,2,3など、完了以外）
          const issues = await callBacklogAPI(
            `/issues?projectId[]=${project.id}&statusId[]=1&statusId[]=2&statusId[]=3&count=100`
          );

          issues.forEach((issue: any) => {
            if (issue.dueDate) {
              const daysUntil = getDaysUntilDue(issue.dueDate);
              // 指定された日数以内の課題のみ
              if (daysUntil <= context.daysThreshold && daysUntil >= 0) {
                allIssues.push({
                  ...issue,
                  projectName: project.name,
                  daysUntilDue: daysUntil,
                });
              }
            }
          });
        } catch (err) {
          console.error(`Error fetching issues for project ${project.name}:`, err);
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
        url: `https://${BACKLOG_SPACE_ID}.backlog.jp/view/${issue.issueKey}`,
      }));

      return { issues: formattedIssues, total: formattedIssues.length };
    } catch (error) {
      return { issues: [], total: 0, error: String(error) };
    }
  },
});

// Backlog Wiki検索ツール
export const backlogSearchWikiTool = createTool({
  id: "backlog-search-wiki",
  description: "BacklogでWikiページを検索します",
  inputSchema: z.object({
    query: z.string().describe("検索クエリ"),
  }),
  outputSchema: z.object({
    pages: z.array(
      z.object({
        id: z.string().describe("WikiページのID"),
        title: z.string().describe("Wikiページのタイトル"),
        url: z.string().describe("WikiページのURL"),
      })
    ),
    total: z.number().describe("検索結果の総数"),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      const projects = await callBacklogAPI("/projects");

      if (!projects || projects.length === 0) {
        return { pages: [], total: 0, error: "プロジェクトが見つかりません" };
      }

      const projectId = projects[0].id;
      const wikis = await callBacklogAPI(`/wikis?projectIdOrKey=${projectId}`);

      const filteredWikis = wikis.filter((wiki: any) =>
        wiki.name.toLowerCase().includes(context.query.toLowerCase()) ||
        (wiki.content && wiki.content.toLowerCase().includes(context.query.toLowerCase()))
      );

      const pages = filteredWikis.map((wiki: any) => ({
        id: String(wiki.id),
        title: wiki.name,
        url: `https://${BACKLOG_SPACE_ID}.backlog.jp/wiki/${projectId}/${wiki.name}`,
      }));

      return { pages, total: pages.length };
    } catch (error) {
      return { pages: [], total: 0, error: String(error) };
    }
  },
});

// Backlog Wiki詳細取得ツール
export const backlogGetWikiTool = createTool({
  id: "backlog-get-wiki",
  description: "指定されたIDのBacklog Wikiページの詳細を取得します",
  inputSchema: z.object({
    pageId: z.string().describe("取得するWikiページのID"),
  }),
  outputSchema: z.object({
    page: z.object({
      id: z.string().describe("WikiページのID"),
      title: z.string().describe("Wikiページのタイトル"),
      url: z.string().describe("WikiページのURL"),
      content: z.string().optional().describe("Wikiページのコンテンツ"),
    }),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      const wiki = await callBacklogAPI(`/wikis/${context.pageId}`);

      return {
        page: {
          id: String(wiki.id),
          title: wiki.name,
          url: `https://${BACKLOG_SPACE_ID}.backlog.jp/wiki/${wiki.projectId}/${wiki.name}`,
          content: wiki.content || undefined,
        },
      };
    } catch (error) {
      return {
        error: String(error),
        page: { id: "", title: "", url: "", content: undefined },
      };
    }
  },
});
