import { createWorkflow, createStep } from "@mastra/core/workflows";
import { backlogSearchUrgentIssuesTool } from "../tools/backlogTool";
import { slackNotifyUrgentIssuesTool } from "../tools/slackTool";
import { z } from "zod";

// Backlog課題をSlackに通知するワークフロー
export const backlogToSlackWorkflow = createWorkflow({
  id: "backlogToSlackWorkflow",
  description: "納期の迫ったBacklog課題を取得してSlackに通知します",
  inputSchema: z.object({
    daysThresholdMin: z
      .number()
      .optional()
      .default(-3)
      .describe("期限までの日数の下限（デフォルト-3: 3日遅延まで）"),
    daysThresholdMax: z
      .number()
      .optional()
      .default(0)
      .describe("期限までの日数の上限（デフォルト0: 期限当日まで）"),
    channelId: z
      .string()
      .optional()
      .describe("送信先のSlackチャンネルID（省略時は環境変数から取得）"),
  }),
  outputSchema: slackNotifyUrgentIssuesTool.outputSchema,
})
  // Step 1: Backlogから納期の迫った課題を取得
  .then(
    createStep({
      id: "fetch-backlog-issues",
      inputSchema: z.object({
        daysThresholdMin: z.number().optional().default(-3),
        daysThresholdMax: z.number().optional().default(0),
        channelId: z.string().optional(),
      }),
      outputSchema: backlogSearchUrgentIssuesTool.outputSchema,
      execute: async ({ inputData, runtimeContext, tracingContext }) => {
        return await backlogSearchUrgentIssuesTool.execute({
          context: {
            daysThresholdMin: inputData.daysThresholdMin,
            daysThresholdMax: inputData.daysThresholdMax,
          },
          runtimeContext,
          tracingContext,
        });
      },
    })
  )
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
