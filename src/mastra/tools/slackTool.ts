import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSlackUserMapping, resolveSlackMention } from "@/lib/googleSheets";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "";

// Slack課題通知ツール（シンプルなリスト形式）
export const slackNotifyUrgentIssuesTool = createTool({
  id: "slack-notify-urgent-issues",
  description: "納期の迫ったBacklog課題をSlackに通知します",
  inputSchema: z.object({
    issues: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        summary: z.string(),
        dueDate: z.string().optional(),
        daysUntilDue: z.number().optional(),
        priority: z.string(),
        status: z.string(),
        assignee: z.string().optional(),
        projectName: z.string(),
        url: z.string(),
      })
    ).describe("通知する課題のリスト"),
    channelId: z.string().optional().describe("送信先のSlackチャンネルID（省略時は環境変数から取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("送信が成功したかどうか"),
    messageUrl: z.string().optional().describe("送信したメッセージのURL"),
    error: z.string().optional().describe("エラーメッセージ"),
  }),
  execute: async ({ context }) => {
    try {
      // 環境変数のチェック
      if (!SLACK_BOT_TOKEN) {
        return {
          success: false,
          error: "SLACK_BOT_TOKEN が設定されていません",
        };
      }

      const targetChannel = context.channelId || SLACK_CHANNEL_ID;
      if (!targetChannel) {
        return {
          success: false,
          error: "SLACK_CHANNEL_ID が設定されていません",
        };
      }

      // 課題がない場合
      if (!context.issues || context.issues.length === 0) {
        const text = "🎉 納期の迫った課題はありません！";

        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: targetChannel,
            text: text,
          }),
        });

        const data = await response.json();

        if (!data.ok) {
          return {
            success: false,
            error: `Slack API エラー: ${data.error}`,
          };
        }

        return {
          success: true,
          messageUrl: data.ts ? `https://slack.com/archives/${targetChannel}/p${data.ts.replace(".", "")}` : undefined,
        };
      }

      // Slackユーザーマッピングを取得
      const userMapping = await getSlackUserMapping();

      // 担当者ごとのメンションを収集（重複排除）
      const mentionSet = new Set<string>();
      const issueMentions: string[] = [];

      context.issues.forEach((issue) => {
        const mention = issue.assignee ? resolveSlackMention(issue.assignee, userMapping) : "";
        issueMentions.push(mention);
        if (mention) {
          mentionSet.add(mention);
        }
      });

      // メッセージ本文を構築
      let messageText = `⚠️ *納期の迫ったBacklog課題（${context.issues.length}件）*\n`;

      // 先頭にメンション一覧を追加
      if (mentionSet.size > 0) {
        messageText += Array.from(mentionSet).join(" ") + "\n";
      }
      messageText += "\n";

      context.issues.forEach((issue, index) => {
        const dueInfo = issue.daysUntilDue !== undefined
          ? `*${issue.daysUntilDue}日後*`
          : "期限未設定";

        messageText += `${index + 1}. <${issue.url}|${issue.key}> ${issue.summary}\n`;
        messageText += `   📅 期限: ${dueInfo}`;

        if (issue.dueDate) {
          messageText += ` (${issue.dueDate})`;
        }

        messageText += `\n`;

        // 担当者表示（メンションがあればメンション、なければ元の名前）
        const mention = issueMentions[index];
        const assigneeDisplay = mention || (issue.assignee || "未割り当て");

        messageText += `   👤 担当: ${assigneeDisplay} | `;
        messageText += `📂 ${issue.projectName} | `;
        messageText += `🏷️ ${issue.status}\n\n`;
      });

      messageText += `\n_更新日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}_`;

      // Slackにメッセージを送信
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          channel: targetChannel,
          text: messageText,
          unfurl_links: false,
          unfurl_media: false,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          success: false,
          error: `Slack API エラー: ${data.error}`,
        };
      }

      return {
        success: true,
        messageUrl: data.ts
          ? `https://slack.com/archives/${targetChannel}/p${data.ts.replace(".", "")}`
          : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `送信エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
