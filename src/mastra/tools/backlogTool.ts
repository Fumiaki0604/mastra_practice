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
