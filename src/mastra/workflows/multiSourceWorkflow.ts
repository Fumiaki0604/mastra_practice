import { createWorkflow, createStep } from "@mastra/core/workflows";
import { confluenceSearchPagesTool, confluenceGetPageTool } from "../tools/confluenceTool";
import { notionSearchPagesTool, notionGetPageTool } from "../tools/notionTool";
import { backlogSearchWikiTool, backlogGetWikiTool } from "../tools/backlogTool";
import { githubCreateIssueTool } from "../tools/githubTool";
import { assistantAgent } from "../agents/assistantAgent";
import { z } from "zod";

// 複数ソース統合検索ワークフロー
export const multiSourceWorkflow = createWorkflow({
  id: "multiSourceWorkflow",
  description: "Confluence、Notion、Backlogから要件書を検索し、GitHub Issueを自動作成します。",
  inputSchema: z.object({
    query: z.string().describe("検索クエリ"),
    owner: z.string().describe("GitHubリポジトリの所有者名"),
    repo: z.string().describe("GitHubリポジトリ名"),
    sources: z.array(z.enum(["confluence", "notion", "backlog"]))
      .optional()
      .describe("検索対象のソース（省略時は全て検索）"),
  }),
  outputSchema: githubCreateIssueTool.outputSchema,
})
  .then(
    createStep({
      id: "multi-source-search",
      inputSchema: z.object({
        query: z.string(),
        owner: z.string(),
        repo: z.string(),
        sources: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            source: z.string(),
            pageId: z.string(),
            title: z.string(),
            url: z.string(),
          })
        ),
        error: z.string().optional(),
      }),
      execute: async ({ inputData }) => {
        const sources = inputData.sources || ["confluence", "notion", "backlog"];
        const allResults: Array<{ source: string; pageId: string; title: string; url: string }> = [];

        // Confluence検索
        if (sources.includes("confluence")) {
          try {
            const cqlPrompt = `以下の検索クエリをConfluence CQLに変換してください。シンプルに text ~ "キーワード" の形式で返してください。\nクエリ: ${inputData.query}\nCQL:`;
            const cqlResult = await assistantAgent.generateVNext(cqlPrompt);
            const cql = cqlResult.text.trim();

            const confluenceResult = await confluenceSearchPagesTool.execute({
              context: { cql },
            });

            if (confluenceResult.pages && confluenceResult.pages.length > 0) {
              confluenceResult.pages.forEach((page) => {
                allResults.push({
                  source: "confluence",
                  pageId: page.id,
                  title: page.title,
                  url: page.url || "",
                });
              });
            }
          } catch (error) {
            console.error("Confluence search error:", error);
          }
        }

        // Notion検索
        if (sources.includes("notion")) {
          try {
            const notionResult = await notionSearchPagesTool.execute({
              context: { query: inputData.query },
            });

            if (notionResult.pages && notionResult.pages.length > 0) {
              notionResult.pages.forEach((page) => {
                allResults.push({
                  source: "notion",
                  pageId: page.id,
                  title: page.title,
                  url: page.url,
                });
              });
            }
          } catch (error) {
            console.error("Notion search error:", error);
          }
        }

        // Backlog検索
        if (sources.includes("backlog")) {
          try {
            const backlogResult = await backlogSearchWikiTool.execute({
              context: { query: inputData.query },
            });

            if (backlogResult.pages && backlogResult.pages.length > 0) {
              backlogResult.pages.forEach((page) => {
                allResults.push({
                  source: "backlog",
                  pageId: page.id,
                  title: page.title,
                  url: page.url,
                });
              });
            }
          } catch (error) {
            console.error("Backlog search error:", error);
          }
        }

        if (allResults.length === 0) {
          return {
            results: [],
            error: "検索結果が見つかりませんでした。",
          };
        }

        return { results: allResults };
      },
    })
  )
  .then(
    createStep({
      id: "fetch-page-content",
      inputSchema: z.object({
        results: z.array(
          z.object({
            source: z.string(),
            pageId: z.string(),
            title: z.string(),
            url: z.string(),
          })
        ),
        error: z.string().optional(),
      }),
      outputSchema: z.object({
        page: z.object({
          source: z.string(),
          id: z.string(),
          title: z.string(),
          url: z.string(),
          content: z.string().optional(),
        }),
        error: z.string().optional(),
      }),
      execute: async ({ inputData }) => {
        if (inputData.error || !inputData.results || inputData.results.length === 0) {
          throw new Error(inputData.error || "検索結果が見つかりませんでした");
        }

        const firstResult = inputData.results[0];
        let pageContent;

        try {
          if (firstResult.source === "confluence") {
            pageContent = await confluenceGetPageTool.execute({
              context: { pageId: firstResult.pageId, expand: "body.storage" },
            });
          } else if (firstResult.source === "notion") {
            pageContent = await notionGetPageTool.execute({
              context: { pageId: firstResult.pageId },
            });
          } else if (firstResult.source === "backlog") {
            pageContent = await backlogGetWikiTool.execute({
              context: { pageId: firstResult.pageId },
            });
          }

          return {
            page: {
              source: firstResult.source,
              id: pageContent?.page?.id || firstResult.pageId,
              title: pageContent?.page?.title || firstResult.title,
              url: pageContent?.page?.url || firstResult.url,
              content: pageContent?.page?.content,
            },
          };
        } catch (error) {
          return {
            page: {
              source: firstResult.source,
              id: firstResult.pageId,
              title: firstResult.title,
              url: firstResult.url,
              content: undefined,
            },
            error: String(error),
          };
        }
      },
    })
  )
  .then(
    createStep({
      id: "create-development-tasks",
      inputSchema: z.object({
        page: z.object({
          source: z.string(),
          id: z.string(),
          title: z.string(),
          url: z.string(),
          content: z.string().optional(),
        }),
        error: z.string().optional(),
      }),
      outputSchema: githubCreateIssueTool.inputSchema,
      execute: async ({ inputData, getInitData }) => {
        const { page, error } = inputData;
        const { owner, repo, query } = getInitData();

        if (error || !page || !page.content) {
          return {
            owner: owner || "",
            repo: repo || "",
            issues: [
              {
                title: "エラー: ページの内容が取得できませんでした",
                body: `ソース: ${page?.source || "不明"}\nエラー: ${error || "コンテンツなし"}`,
              },
            ],
          };
        }

        const outputSchema = z.object({
          issues: z.array(
            z.object({
              title: z.string(),
              body: z.string(),
            })
          ),
        });

        const analysisPrompt = `以下の${page.source}ページの内容は要件書です。この要件書を分析して、開発バックログのGitHub Issueを複数作成するための情報を生成してください。

ユーザーの質問: ${query}
ソース: ${page.source}
ページタイトル: ${page.title}
ページURL: ${page.url}
ページ内容:
${page.content}

重要：
- 要件書の内容を機能やコンポーネント単位で分割
- 各Issueのtitleは簡潔で分かりやすく
- bodyはMarkdown形式で構造化し、元のページURLも含める
- フォーマットはJSON配列形式で、必ず出力。枕詞は不要。トップの配列は必ず角括弧で囲む。
- \`\`\`jsonのようなコードブロックは不要
- 2つIssueを作成
- 曖昧な部分は「要確認」として記載`;

        try {
          const result = await assistantAgent.generateVNext(analysisPrompt, {
            output: outputSchema,
          });

          const parsedResult = JSON.parse(result.text);
          const issues = parsedResult.issues.map((issue: any) => ({
            title: issue.title,
            body: `${issue.body}\n\n---\n**参照元:** [${page.title}](${page.url}) (${page.source})`,
          }));

          return {
            owner: owner || "",
            repo: repo || "",
            issues: issues,
          };
        } catch (error) {
          return {
            owner: owner,
            repo: repo,
            issues: [
              {
                title: "エラー: Issue作成に失敗",
                body: "エラーが発生しました: " + String(error),
              },
            ],
          };
        }
      },
    })
  )
  .then(createStep(githubCreateIssueTool))
  .commit();
