import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { briefingResultSchema, diagnosisResultSchema, type AiKind } from "./contracts";
import { COMMON_INSTRUCTION, TASK_INSTRUCTION } from "./prompts";

export type GenerateInput = { kind: AiKind; payload: unknown; apiKey: string; model: string; signal: AbortSignal };
export async function generateGemini(input: GenerateInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey, httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } });
  const schema = input.kind === "diagnosis" ? diagnosisResultSchema : briefingResultSchema;
  const response = await ai.models.generateContent({
    model: input.model,
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input.payload) }] }],
    config: {
      systemInstruction: `${COMMON_INSTRUCTION}\n${TASK_INSTRUCTION[input.kind]}`,
      responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema),
      maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: input.signal,
    },
  });
  return response.text ?? "";
}
