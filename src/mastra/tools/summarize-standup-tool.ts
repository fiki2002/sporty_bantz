import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();


const filepath = path.resolve("")

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export const summarizeStandUpTool = createTool({
        id: "summarize-standups",
        description: "Summarizes all recorded daily standups into a short report.",
        inputSchema: z.object({
                updates: z.array(z.string()).describe("List of team updates to summarize"),
        }),
        outputSchema: z.object({
                summary: z.string(),
        }),
        execute: async ({ context }) => {
                const { updates } = context;

                const prompt = `
You are a helpful assistant. Summarize the following team updates into a concise, professional daily standup summary.

Updates:
${updates.join("\n")}
`;

                try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response.text();

                        return { summary: response };
                } catch (error) {
                        console.error("Error summarizing updates:", error);
                        return { summary: "Sorry, I couldn't summarize the updates today." };
                }
        },
});
