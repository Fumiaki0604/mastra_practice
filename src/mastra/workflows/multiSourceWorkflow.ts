import { createWorkflow, createStep } from "@mastra/core/workflows";
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
        sources: z.array(z.enum(["confluence", "notion", "backlog"])).optional(),
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
            const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
            const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";
            const CONFLUENCE_USER_EMAIL = process.env.CONFLUENCE_USER_EMAIL || "";

            console.log("Confluence環境変数確認:", {
              hasBaseUrl: !!CONFLUENCE_BASE_URL,
              hasToken: !!CONFLUENCE_API_TOKEN,
              hasEmail: !!CONFLUENCE_USER_EMAIL,
              baseUrl: CONFLUENCE_BASE_URL,
            });

            if (!CONFLUENCE_BASE_URL || !CONFLUENCE_API_TOKEN) {
              throw new Error("Confluence API設定が不足しています");
            }

            const cqlPrompt = `以下の検索クエリをConfluence CQLに変換してください。シンプルに text ~ "キーワード" の形式で返してください。\nクエリ: ${inputData.query}\nCQL:`;
            const cqlResult = await assistantAgent.generateVNext(cqlPrompt);
            const cql = cqlResult.text.trim();

            console.log("生成されたCQL:", cql);

            const auth = Buffer.from(`${CONFLUENCE_USER_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
            const params = new URLSearchParams();
            params.append("cql", cql);

            const searchUrl = `${CONFLUENCE_BASE_URL}/wiki/rest/api/search?${params.toString()}`;
            console.log("Confluence検索URL:", searchUrl);

            const response = await fetch(searchUrl, {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
            });

            console.log("Confluence APIレスポンスステータス:", response.status);

            if (response.ok) {
              const data = await response.json();
              console.log("検索結果件数:", data.results?.length || 0);

              data.results?.forEach((result: any) => {
                if (result.content) {
                  allResults.push({
                    source: "confluence",
                    pageId: result.content.id,
                    title: result.content.title,
                    url: `${CONFLUENCE_BASE_URL}/wiki${result.url}`,
                  });
                }
              });
            } else {
              const errorText = await response.text();
              console.error("Confluence API エラー:", response.status, errorText);
            }
          } catch (error) {
            console.error("Confluence search error:", error);
          }
        }

        // Notion検索
        if (sources.includes("notion")) {
          try {
            const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";

            console.log("Notion環境変数確認:", {
              hasToken: !!NOTION_API_TOKEN,
            });

            if (!NOTION_API_TOKEN) {
              console.warn("Notion API設定が不足しています");
            } else {
              const response = await fetch("https://api.notion.com/v1/search", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${NOTION_API_TOKEN}`,
                  "Notion-Version": "2022-06-28",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  query: inputData.query,
                  filter: { property: "object", value: "page" },
                  page_size: 10,
                }),
              });

              console.log("Notion APIレスポンスステータス:", response.status);

              if (response.ok) {
                const data = await response.json();
                console.log("Notion検索結果件数:", data.results?.length || 0);

                data.results?.forEach((page: any) => {
                  const titleProp = page.properties?.title || page.properties?.Name;
                  let title = "Untitled";
                  if (titleProp?.title?.[0]?.plain_text) {
                    title = titleProp.title[0].plain_text;
                  } else if (titleProp?.rich_text?.[0]?.plain_text) {
                    title = titleProp.rich_text[0].plain_text;
                  }

                  allResults.push({
                    source: "notion",
                    pageId: page.id,
                    title,
                    url: page.url,
                  });
                });
              } else {
                const errorText = await response.text();
                console.error("Notion API エラー:", response.status, errorText);
              }
            }
          } catch (error) {
            console.error("Notion search error:", error);
          }
        }

        // Backlog検索（納期の迫っている課題）
        if (sources.includes("backlog")) {
          try {
            const BACKLOG_SPACE_ID = process.env.BACKLOG_SPACE_ID || "";
            const BACKLOG_API_KEY = process.env.BACKLOG_API_KEY || "";

            console.log("Backlog環境変数確認:", {
              hasSpaceId: !!BACKLOG_SPACE_ID,
              hasApiKey: !!BACKLOG_API_KEY,
            });

            if (!BACKLOG_SPACE_ID || !BACKLOG_API_KEY) {
              console.warn("Backlog API設定が不足しています");
            } else {
              // 納期14日以内の課題を検索（クエリから日数を抽出するか、デフォルト14日）
              const daysThreshold = 14;

              const projectsResponse = await fetch(
                `https://${BACKLOG_SPACE_ID}.backlog.jp/api/v2/projects?apiKey=${BACKLOG_API_KEY}`
              );

              if (projectsResponse.ok) {
                const projects = await projectsResponse.json();
                console.log("Backlogプロジェクト数:", projects.length);

                for (const project of projects) {
                  try {
                    const issuesResponse = await fetch(
                      `https://${BACKLOG_SPACE_ID}.backlog.jp/api/v2/issues?projectId[]=${project.id}&statusId[]=1&statusId[]=2&statusId[]=3&count=100&apiKey=${BACKLOG_API_KEY}`
                    );

                    if (issuesResponse.ok) {
                      const issues = await issuesResponse.json();

                      issues.forEach((issue: any) => {
                        if (issue.dueDate) {
                          const due = new Date(issue.dueDate);
                          const now = new Date();
                          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                          if (diffDays <= daysThreshold && diffDays >= 0) {
                            allResults.push({
                              source: "backlog",
                              pageId: String(issue.id),
                              title: `[${diffDays}日後期限] ${issue.summary} (${project.name})`,
                              url: `https://${BACKLOG_SPACE_ID}.backlog.jp/view/${issue.issueKey}`,
                            });
                          }
                        }
                      });
                    }
                  } catch (err) {
                    console.error(`Error fetching Backlog issues for project ${project.name}:`, err);
                  }
                }

                console.log("Backlog検索結果件数:", allResults.filter(r => r.source === "backlog").length);
              }
            }
          } catch (error) {
            console.error("Backlog search error:", error);
          }
        }

        console.log("全検索結果件数:", allResults.length);

        if (allResults.length === 0) {
          const searchedSources = sources.join(", ");
          return {
            results: [],
            error: `検索結果が見つかりませんでした。${searchedSources}に該当する情報があるか確認してください。`,
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
        // 検索結果が0件の場合は、エラーを投げずに適切なメッセージを返す
        if (inputData.error || !inputData.results || inputData.results.length === 0) {
          return {
            page: {
              source: "none",
              id: "",
              title: "検索結果なし",
              url: "",
              content: undefined,
            },
            error: inputData.error || "検索結果が見つかりませんでした。Notion、Backlog、Confluenceに該当する情報を作成するか、検索クエリを変更してください。",
          };
        }

        const firstResult = inputData.results[0];

        try {
          // Confluence
          if (firstResult.source === "confluence") {
            const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
            const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";
            const CONFLUENCE_USER_EMAIL = process.env.CONFLUENCE_USER_EMAIL || "";

            const auth = Buffer.from(`${CONFLUENCE_USER_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
            const params = new URLSearchParams();
            params.append("expand", "body.storage");

            const response = await fetch(`${CONFLUENCE_BASE_URL}/wiki/rest/api/content/${firstResult.pageId}?${params.toString()}`, {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
            });

            if (response.ok) {
              const page = await response.json();
              return {
                page: {
                  source: firstResult.source,
                  id: page.id,
                  title: page.title,
                  url: `${CONFLUENCE_BASE_URL}/wiki${page._links?.webui}`,
                  content: page.body?.storage?.value,
                },
              };
            }
          }

          // Notion
          if (firstResult.source === "notion") {
            const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";

            const pageResponse = await fetch(`https://api.notion.com/v1/pages/${firstResult.pageId}`, {
              headers: {
                Authorization: `Bearer ${NOTION_API_TOKEN}`,
                "Notion-Version": "2022-06-28",
              },
            });

            const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${firstResult.pageId}/children`, {
              headers: {
                Authorization: `Bearer ${NOTION_API_TOKEN}`,
                "Notion-Version": "2022-06-28",
              },
            });

            if (pageResponse.ok && blocksResponse.ok) {
              const page = await pageResponse.json();
              const blocks = await blocksResponse.json();

              const content = blocks.results
                .map((block: any) => {
                  if (block.type === "paragraph" && block.paragraph?.rich_text) {
                    return block.paragraph.rich_text.map((text: any) => text.plain_text).join("");
                  }
                  if (block.type === "heading_1" && block.heading_1?.rich_text) {
                    return "# " + block.heading_1.rich_text.map((text: any) => text.plain_text).join("");
                  }
                  if (block.type === "heading_2" && block.heading_2?.rich_text) {
                    return "## " + block.heading_2.rich_text.map((text: any) => text.plain_text).join("");
                  }
                  if (block.type === "bulleted_list_item" && block.bulleted_list_item?.rich_text) {
                    return "- " + block.bulleted_list_item.rich_text.map((text: any) => text.plain_text).join("");
                  }
                  return "";
                })
                .filter((text: string) => text)
                .join("\n");

              return {
                page: {
                  source: firstResult.source,
                  id: firstResult.pageId,
                  title: firstResult.title,
                  url: page.url,
                  content: content || undefined,
                },
              };
            }
          }

          // Backlog（課題の詳細を取得）
          if (firstResult.source === "backlog") {
            const BACKLOG_SPACE_ID = process.env.BACKLOG_SPACE_ID || "";
            const BACKLOG_API_KEY = process.env.BACKLOG_API_KEY || "";

            const response = await fetch(
              `https://${BACKLOG_SPACE_ID}.backlog.jp/api/v2/issues/${firstResult.pageId}?apiKey=${BACKLOG_API_KEY}`
            );

            if (response.ok) {
              const issue = await response.json();

              const content = `# ${issue.summary}

**プロジェクト:** ${issue.projectId}
**期限:** ${issue.dueDate || "未設定"}
**優先度:** ${issue.priority?.name || "未設定"}
**ステータス:** ${issue.status?.name || "不明"}
**担当者:** ${issue.assignee?.name || "未割り当て"}

## 詳細
${issue.description || "詳細なし"}
`;

              return {
                page: {
                  source: firstResult.source,
                  id: String(issue.id),
                  title: firstResult.title,
                  url: firstResult.url,
                  content,
                },
              };
            }
          }

          return {
            page: {
              source: firstResult.source,
              id: firstResult.pageId,
              title: firstResult.title,
              url: firstResult.url,
              content: undefined,
            },
            error: "ページ内容の取得に失敗しました",
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

        // 検索結果が見つからなかった場合は、その旨をIssueとして作成
        if (error || !page || !page.content) {
          return {
            owner: owner || "",
            repo: repo || "",
            issues: [
              {
                title: `調査依頼: ${query}`,
                body: `## 検索結果

検索クエリ「${query}」に該当する情報がConfluenceで見つかりませんでした。

### 次のアクション
- [ ] Confluenceに該当する要件書やドキュメントが存在するか確認
- [ ] 検索キーワードを変更して再検索
- [ ] 必要に応じて新しいドキュメントをConfluenceに作成

### エラー詳細
${error || "コンテンツが取得できませんでした"}

---
**検索ソース:** Confluence
**検索クエリ:** ${query}`,
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
