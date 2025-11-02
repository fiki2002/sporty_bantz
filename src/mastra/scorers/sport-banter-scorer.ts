import { z } from 'zod';
import { createToolCallAccuracyScorerCode, createCompletenessScorer } from '@mastra/evals/scorers/code';
import { createScorer } from '@mastra/core/scores';

/**
 * 1️⃣ Check if SportyBot used the sportsTool correctly
 */
export const toolCallAppropriatenessScorer = createToolCallAccuracyScorerCode({
        expectedTool: 'sportsTool',
        strictMode: false,
});

/**
 * 2️⃣ Check if responses are complete — i.e., the user’s sports question was fully answered
 */
export const completenessScorer = createCompletenessScorer();

/**
 * 3️⃣ Evaluate banter style — does the reply have the right tone and engagement?
 *     Uses LLM judging for humor, tone, and personality.
 */
export const banterToneScorer = createScorer({
        name: 'Banter Tone Quality',
        description:
                'Evaluates whether SportyBot responds in a playful, witty, and engaging tone without being toxic.',
        type: 'agent',
        judge: {
                model: 'google/gemini-2.5-pro',
                instructions: `
      You are evaluating an AI agent called SportyBot that chats about sports.
      Check if its response has a friendly, witty, and confident tone suitable for sports banter.
      It should sound like a fun friend who loves sports — not too formal, not rude.
      Score higher if:
      - The tone feels playful and natural
      - It includes light humor or emojis
      - It stays respectful while bantering
      - It engages the user with personality
      Deduct points if it’s too flat, robotic, or toxic.
      Output a JSON following the schema provided.`,
        },
})
        .preprocess(({ run }) => {
                const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
                const assistantText = (run.output?.[0]?.content as string) || '';
                return { userText, assistantText };
        })
        .analyze({
                description: 'Judge SportyBot’s tone and engagement quality',
                outputSchema: z.object({
                        playful: z.boolean(),
                        respectful: z.boolean(),
                        toxic: z.boolean().default(false),
                        humorLevel: z.number().min(0).max(1).default(0.5),
                        confidence: z.number().min(0).max(1).default(1),
                        explanation: z.string().default(''),
                }),
                createPrompt: ({ results }) => `
      Evaluate the following conversation for tone and engagement.

      User message:
      """
      ${results.preprocessStepResult.userText}
      """

      SportyBot reply:
      """
      ${results.preprocessStepResult.assistantText}
      """

      Determine if the reply fits these criteria:
      - Playful and confident (not boring)
      - Respectful and non-toxic
      - Has some humor or personality
      - Sounds like friendly sports banter

      Return JSON:
      {
        "playful": boolean,
        "respectful": boolean,
        "toxic": boolean,
        "humorLevel": number, // 0-1
        "confidence": number, // 0-1
        "explanation": string
      }
    `,
        })
        .generateScore(({ results }) => {
                const r = (results as any)?.analyzeStepResult || {};
                if (r.toxic) return 0; // toxic → fail
                let score = 0;
                if (r.playful) score += 0.4;
                if (r.respectful) score += 0.3;
                score += (r.humorLevel || 0) * 0.3;
                return Math.min(1, score);
        })
        .generateReason(({ results, score }) => {
                const r = (results as any)?.analyzeStepResult || {};
                return `Banter tone scoring: playful=${r.playful}, respectful=${r.respectful}, humor=${r.humorLevel}, toxic=${r.toxic}. Score=${score}. ${r.explanation}`;
        });

/**
 * 4️⃣ Evaluate factual accuracy — checks if SportyBot gave correct info (for known facts)
 */
export const accuracyScorer = createScorer({
        name: 'Factual Accuracy',
        description: 'Checks if sports facts or stats mentioned are accurate and relevant.',
        type: 'agent',
        judge: {
                model: 'google/gemini-2.5-pro',
                instructions: `
      You are verifying if SportyBot's sports-related responses are factually correct.
      Focus on objective claims: match results, player stats, records, or trivia.
      Ignore subjective banter or humor.
      Return only valid JSON per schema.`,
        },
})
        .preprocess(({ run }) => {
                const question = (run.input?.inputMessages?.[0]?.content as string) || '';
                const answer = (run.output?.[0]?.content as string) || '';
                return { question, answer };
        })
        .analyze({
                description: 'Judge factual correctness of SportyBot’s answers',
                outputSchema: z.object({
                        factual: z.boolean(),
                        relevant: z.boolean(),
                        confidence: z.number().min(0).max(1).default(1),
                        explanation: z.string().default(''),
                }),
                createPrompt: ({ results }) => `
      Check if the assistant’s answer is factually correct and relevant.

      User question:
      """
      ${results.preprocessStepResult.question}
      """

      SportyBot’s answer:
      """
      ${results.preprocessStepResult.answer}
      """

      Evaluate factual accuracy and relevance.
      Return JSON:
      {
        "factual": boolean,
        "relevant": boolean,
        "confidence": number,
        "explanation": string
      }
    `,
        })
        .generateScore(({ results }) => {
                const r = (results as any)?.analyzeStepResult || {};
                if (!r.relevant) return 0;
                if (!r.factual) return 0.2 * (r.confidence ?? 0);
                return Math.min(1, 0.7 + 0.3 * (r.confidence ?? 1));
        })
        .generateReason(({ results, score }) => {
                const r = (results as any)?.analyzeStepResult || {};
                return `Accuracy scoring: factual=${r.factual}, relevant=${r.relevant}, confidence=${r.confidence}. Score=${score}. ${r.explanation}`;
        });

/**
 * Export all scorers
 */
export const scorers = {
        toolCallAppropriatenessScorer,
        completenessScorer,
        banterToneScorer,
        accuracyScorer,
};
