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
        Barcelona: "133739",
        "Real Madrid": "133738",
        PSG: "133722",
        Juventus: "133676",
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(prompt: string, retries = 3): Promise<string> {
        for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                        const result = await model.generateContent(prompt);
                        const text = result.response.text();
                        return text.trim();
                } catch (error: any) {
                        if (attempt < retries) {
                                console.warn(`Gemini error, retrying (${attempt}/${retries})...`);
                                await delay(1000 * attempt);
                        } else {
                                throw error;
                        }
                }
        }
        throw new Error("Failed to call Gemini after retries.");
}

async function classifyIntent(message: string): Promise<string> {
        const intentPrompt = `
You are a classifier. Classify this sports-related message into one of these intents:
[banter, roast, hype, factual, trivia, unknown]
Message: "${message}"
Respond with only one word.`;
        const result = await model.generateContent(intentPrompt);
        return result.response.text().trim().toLowerCase();
}

export const sportBanterTool = createTool({
        id: "sport-banter",
        description: `
Fetches recent sports results and generates fun, witty, or savage sports banter using Google Gemini.
It can roast fans, hype wins, or debate players with personality.`,
        inputSchema: z.object({
                sport: z.string().optional(),
                league: z.string().optional(),
                team: z.string().optional(),
                mood: z.string().optional(),
                userMessage: z.string().describe("The user's message about sports or a team."),
        }),
        outputSchema: z.object({
                message: z.string(),
        }),

        execute: async ({ context }) => {
                const {
                        sport = "football",
                        league = "4328",
                        team: userTeam,
                        mood,
                        userMessage,
                } = context;

                const today = dayjs();
                let targetDate: string | null = null;
                if (/yesterday/i.test(userMessage)) targetDate = today.subtract(1, "day").format("YYYY-MM-DD");
                else if (/today/i.test(userMessage)) targetDate = today.format("YYYY-MM-DD");

                const detectedTeam = Object.keys(TEAM_IDS).find(t => new RegExp(t, "i").test(userMessage));
                const focusTeam = userTeam || detectedTeam || null;

                let matchSummary = null;
                if (focusTeam) {
                        try {
                                const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/eventslast.php?id=${TEAM_IDS[focusTeam]}`;
                                const res = await fetch(url);
                                const data = await res.json();
                                const matches = data?.results || [];
                                const match = targetDate
                                        ? matches.find((m: any) => m.dateEvent === targetDate)
                                        : matches[0];
                                if (match) {
                                        matchSummary = `${match.strEvent}: ${match.intHomeScore} - ${match.intAwayScore} (${match.dateEvent})`;
                                }
                        } catch (err) {
                                console.warn("Failed to fetch sports data:", err);
                        }
                }

                const detectedIntent = await classifyIntent(userMessage);
                const tone = mood || detectedIntent || "banter";

                const MOODS: Record<string, string> = {
                        banter: "Playful, witty, and conversational. Drop lighthearted jokes and puns.",
                        roast: "Spicy, clever, and cheeky. Roast with humor, but never be mean or toxic.",
                        hype: "Energetic and fan-like, full of excitement and emojis.",
                        factual: "Accurate, calm, and informative with a touch of personality.",
                        trivia: "Fun and curious, like sharing random cool sports facts.",
                };

                const moodDescription = MOODS[tone] || MOODS.banter;

                let prompt = `
You are SportyBantz — a sports AI who delivers banter, roasts, and witty insights about ${sport}.
Tone: ${moodDescription}

If match data is available, use it for context.
If not, respond with clever general sports commentary.

User message: "${userMessage}"
${focusTeam ? `Focus team: ${focusTeam}` : ""}
${matchSummary ? `Match: ${matchSummary}` : ""}
`;

                prompt += `
Structure your response like this:
1. Start with a playful reaction (e.g. "Oof!", "Mate...", "What a day!")
2. Add witty or cheeky commentary.
3. Finish with a short closer or emoji (but don’t overdo it).
`;

                try {
                        const text = await callGemini(prompt);
                        return { message: text };
                } catch (error) {
                        console.error("SportyBantz error:", error);
                        return {
                                message: "Even my circuits fumbled that one ⚙️ Try again in a sec!",
                        };
                }
        },
});
