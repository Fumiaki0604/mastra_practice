import { createWorkflow, createStep } from "@mastra/core/workflows";
import { backlogSearchUrgentIssuesTool } from "../tools/backlogTool";
import { slackNotifyUrgentIssuesTool } from "../tools/slackTool";
import { z } from "zod";

// Backlog課題をSlackに通知するワークフロー
export const backlogToSlackWorkflow = createWorkflow({
  id: "backlogToSlackWorkflow",
  description: "納期の迫ったBacklog課題を取得してSlackに通知します",
  inputSchema: z.object({
    daysThreshold: z
      .number()
      .optional()
      .default(3)
      .describe("期限までの日数の閾値（デフォルト3日）"),
    channelId: z
      .string()
      .optional()
      .describe("送信先のSlackチャンネルID（省略時は環境変数から取得）"),
  }),
  outputSchema: slackNotifyUrgentIssuesTool.outputSchema,
})
  // Step 1: Backlogから納期の迫った課題を取得
  .then(createStep(backlogSearchUrgentIssuesTool))
  // Step 2: 取得した課題をSlackに通知
  .then(
    createStep({
      id: "prepare-slack-notification",
      inputSchema: backlogSearchUrgentIssuesTool.outputSchema,
      outputSchema: slackNotifyUrgentIssuesTool.inputSchema,
      execute: async ({ inputData, getInitData }) => {
        const { issues, error } = inputData;
        const { channelId } = getInitData();

        // エラーが発生した場合でも、空の配列として処理を継続
        if (error) {
          console.warn("Backlog課題取得時の警告:", error);
        }

        return {
          issues: issues || [],
          channelId: channelId,
        };
      },
    })
  )
  // Step 3: Slackに送信
  .then(createStep(slackNotifyUrgentIssuesTool))
  .commit();
