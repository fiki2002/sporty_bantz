import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config();

const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || "1";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const TEAM_IDS: Record<string, string> = {
        Liverpool: "133602",
        "Manchester United": "133612",
        Arsenal: "133604",
        Chelsea: "133610",
};

const rateLimit = {
        requests: [] as number[],
        limit: 1,
        window: 60000,

        async wait() {
                const now = Date.now();
                this.requests = this.requests.filter(time => now - time < this.window);

                if (this.requests.length >= this.limit) {
                        const oldestRequest = this.requests[0];
                        const waitTime = this.window - (now - oldestRequest);
                        console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                this.requests.push(Date.now());
        }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(prompt: string, maxRetries: number = 3): Promise<string> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                        await rateLimit.wait();

                        console.log(`Gemini API call attempt ${attempt}/${maxRetries}...`);
                        const result = await model.generateContent(prompt);
                        const text = await result.response.text();
                        return text.trim();
                } catch (error: any) {
                        lastError = error;

                        if (error.statusCode === 429 || error.message?.includes("quota")) {
                                if (attempt < maxRetries) {
                                        const waitTime = Math.pow(2, attempt) * 1000;
                                        console.log(
                                                `Rate limited on attempt ${attempt}. Retrying in ${waitTime}ms...`
                                        );
                                        await delay(waitTime);
                                        continue;
                                } else {
                                        console.error(`Failed after ${maxRetries} attempts due to rate limiting`);
                                }
                        }

                        if (attempt === maxRetries) {
                                throw error;
                        }

                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(
                                `Error on attempt ${attempt}: ${error.message}. Retrying in ${waitTime}ms...`
                        );
                        await delay(waitTime);
                }
        }

        throw lastError || new Error("Failed to call Gemini API after retries");
}

export const sportBanterTool = createTool({
        id: "sport-banter",
        description: `
    Fetches recent sports results, detects if the user asks about a specific match or player, 
    and creates fun, witty sports banter or analysis using Google Gemini.
  `,
        inputSchema: z.object({
                sport: z.string().optional(),
                league: z.string().optional(),
                team: z.string().optional(),
                mood: z.string().optional(),
                userMessage: z.string().describe("The user's raw message"),
        }),
        outputSchema: z.object({
                message: z.string(),
        }),
        execute: async ({ context }) => {
                const {
                        sport = "football",
                        league = "4328",
                        team: userTeam,
                        mood = "funny",
                        userMessage,
                } = context;

                try {
                        const today = dayjs();
                        let targetDate: string | null = null;

                        if (/yesterday/i.test(userMessage))
                                targetDate = today.subtract(1, "day").format("YYYY-MM-DD");
                        else if (/today/i.test(userMessage))
                                targetDate = today.format("YYYY-MM-DD");

                        const detectedTeamMatch = Object.keys(TEAM_IDS).find(teamName =>
                                new RegExp(teamName, "i").test(userMessage)
                        );

                        const focusTeam = userTeam || detectedTeamMatch || null;

                        let matchSummary = null;

                        if (focusTeam) {
                                try {
                                        const teamId = TEAM_IDS[focusTeam];
                                        const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/eventslast.php?id=${teamId}`;
                                        const res = await fetch(url);
                                        const data = await res.json();
                                        const matches = data?.results || data?.events || [];

                                        const match = targetDate
                                                ? matches.find((m: any) => m.dateEvent === targetDate)
                                                : matches[0];

                                        if (match) {
                                                matchSummary = `${match.strEvent}: ${match.intHomeScore} - ${match.intAwayScore} (${match.dateEvent})`;
                                        }
                                } catch (fetchError) {
                                        console.warn("Failed to fetch sports data:", fetchError);
                                }
                        }

                        let prompt = `
                                        You are a witty sports commentator with deep knowledge of ${sport}.
                                        Your tone is ${mood} — fun, playful, and fan-like.
                                        `;

                        if (matchSummary) {
                                prompt += `
                                        User asked: "${userMessage}"
                                        Focus team: "${focusTeam}"
                                        Match result: "${matchSummary}"

                                        Create short, entertaining banter about this match and focus team.
                                        Use emojis if appropriate.
                                        `;
                        } else {
                                prompt += `
                        User asked: "${userMessage}"

                        You don't have a specific match, so respond with general sports banter, trivia, or cheeky opinion.
                        Use emojis if appropriate.
                        `;
                        }

                        const text = await callGeminiWithRetry(prompt);

                        return { message: text };
                } catch (error) {
                        console.error("Sport banter tool error:", error);

                        const errorMessage =
                                error instanceof Error && error.message?.includes("quota")
                                        ? "I'm swamped with requests right now! My AI coach is catching up on highlights. Try again in a few seconds! 🎬⚽️"
                                        : "Couldn't fetch results or generate banter right now. Maybe my AI coach is off-duty 🤖⚽️";

                        return {
                                message: errorMessage,
                        };
                }
        },
});