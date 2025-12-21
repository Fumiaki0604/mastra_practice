import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_API_VERSION = "2022-06-28";

function getNotionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${NOTION_API_TOKEN}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

async function callNotionAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `https://api.notion.com/v1${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getNotionHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }
  return response.json();
}

// Notionページ検索ツール
export const notionSearchPagesTool = createTool({
  id: "notion-search-pages",
  description: "Notionでページを検索します",
  inputSchema: z.object({
    query: z.string().describe("検索クエリ"),
  }),
  outputSchema: z.object({
    pages: z.array(
      z.object({
        id: z.string().describe("ページのID"),
        title: z.string().describe("ページのタイトル"),
        url: z.string().describe("ページのURL"),
      })
    ),
    total: z.number().describe("検索結果の総数"),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      const data = await callNotionAPI("/search", {
        method: "POST",
        body: JSON.stringify({
          query: context.query,
          filter: { property: "object", value: "page" },
          page_size: 10,
        }),
      });

      const pages = data.results.map((page: any) => {
        const titleProp = page.properties?.title || page.properties?.Name;
        let title = "Untitled";
        if (titleProp?.title?.[0]?.plain_text) {
          title = titleProp.title[0].plain_text;
        } else if (titleProp?.rich_text?.[0]?.plain_text) {
          title = titleProp.rich_text[0].plain_text;
        }

        return {
          id: page.id,
          title,
          url: page.url,
        };
      });

      return { pages, total: pages.length };
    } catch (error) {
      return { pages: [], total: 0, error: String(error) };
    }
  },
});

// Notionページ詳細取得ツール
export const notionGetPageTool = createTool({
  id: "notion-get-page",
  description: "指定されたIDのNotionページの詳細を取得します",
  inputSchema: z.object({
    pageId: z.string().describe("取得するページのID"),
  }),
  outputSchema: z.object({
    page: z.object({
      id: z.string().describe("ページのID"),
      title: z.string().describe("ページのタイトル"),
      url: z.string().describe("ページのURL"),
      content: z.string().optional().describe("ページのコンテンツ"),
    }),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      const page = await callNotionAPI(`/pages/${context.pageId}`);
      const blocks = await callNotionAPI(`/blocks/${context.pageId}/children`);

      const titleProp = page.properties?.title || page.properties?.Name;
      let title = "Untitled";
      if (titleProp?.title?.[0]?.plain_text) {
        title = titleProp.title[0].plain_text;
      } else if (titleProp?.rich_text?.[0]?.plain_text) {
        title = titleProp.rich_text[0].plain_text;
      }

      const content = blocks.results
        .map((block: any) => {
          if (block.type === "paragraph" && block.paragraph?.rich_text) {
            return block.paragraph.rich_text
              .map((text: any) => text.plain_text)
              .join("");
          }
          if (block.type === "heading_1" && block.heading_1?.rich_text) {
            return "# " + block.heading_1.rich_text
              .map((text: any) => text.plain_text)
              .join("");
          }
          if (block.type === "heading_2" && block.heading_2?.rich_text) {
            return "## " + block.heading_2.rich_text
              .map((text: any) => text.plain_text)
              .join("");
          }
          if (block.type === "bulleted_list_item" && block.bulleted_list_item?.rich_text) {
            return "- " + block.bulleted_list_item.rich_text
              .map((text: any) => text.plain_text)
              .join("");
          }
          return "";
        })
        .filter((text: string) => text)
        .join("\n");

      return {
        page: {
          id: page.id,
          title,
          url: page.url,
          content: content || undefined,
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
