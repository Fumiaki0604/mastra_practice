import { Mastra } from "@mastra/core";
import { assistantAgent } from "./agents/assistantAgent";
import { handsonWorkflow } from "./workflows/handson";
import { multiSourceWorkflow } from "./workflows/multiSourceWorkflow";
import { backlogToSlackWorkflow } from "./workflows/backlogToSlackWorkflow";

export const mastra = new Mastra({
  agents: { assistantAgent },
  workflows: {
    handsonWorkflow,
    multiSourceWorkflow,
    backlogToSlackWorkflow,
  },
});
