import { Agent } from "@mastra/core/agent";
// import { getBedrockModel } from "../../../lib/aws-configs";

// const model = await getBedrockModel();

// 一時的にダミーのエージェントを作成（Backlog課題通知機能では使用しない）
export const assistantAgent = new Agent({
  name: "assistant",
  instructions:
    "あなたは親切で知識豊富なAIアシスタントです。ユーザーの質問に対して、わかりやすく丁寧に回答してください。必要に応じてGitHubツールを使用してイシューの作成を行うことができます。",
  model: null as any, // 一時的な対処
});