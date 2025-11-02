import { createTool } from '@mastra/core/tools';
import { z } from 'zod';


export const logStandupTool = createTool({
   id: "log-standup",
   description: "Logs a team member's daily update for later summarization.",
   inputSchema: z.object({
    user: z.string().describe("The name of the person giving the update"),
    update: z.string().describe("The user's daily update message"),
   }),
   outputSchema: z.object({
    message: z.string(),
   }),
    execute: async ({ context }) => {
    const { user, update } = context;

    // This is where you could store updates in a database or file
    // For now, let's just save them in memory or a mock file
    console.log(`[${user}] - ${update}`);

    // TODO: Save the update in a persistent store (LibSQL, Supabase, etc.)

    return {
      message: `Update from ${user} recorded successfully!`,
    };
  },
});