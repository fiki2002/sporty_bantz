import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { logStandupTool } from "../tools/log-standup-tool";
import { summarizeStandUpTool } from "../tools/summarize-standup-tool";

export const standUpSummarizerAgent = new Agent({
        name: "Daily Standup Assistant",
        instructions: `
You are a Daily Standup Assistant.
- Ask each teammate for their daily updates.
- Log updates to memory.
- Be polite and conversational.
- When requested, summarize the day's updates clearly and concisely.
`,
        model: "google/gemini-2.5-flash",
        tools: { logStandupTool, summarizeStandUpTool },
        memory: new Memory({
                storage: new LibSQLStore({
                        url: "file:../mastra.db",
                }),
        }),
});
