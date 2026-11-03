import { z } from "zod";

const shortText = z.string().trim().min(1).max(300);
const id = z.string().min(1).max(100);
const km = z.number().int().min(0).max(20000000);
const date = z.iso.date();
const state = z.enum(["ok", "soon", "over"]);
export const contextSchema = z.object({
  car: z.object({ name: z.string().trim().min(1).max(40), year: z.number().int().min(1980).max(2100), km }).strict().nullable(),
  asOf: date,
  items: z.array(z.object({ id, name: z.string().trim().min(1).max(30), lastKm: km, lastDate: date.nullable(), interval: km.min(1), intervalMonths: z.number().int().min(0).max(240), nextKm: km, remainingKm: z.number().int().min(-10000000).max(20000000), dateDue: date.nullable(), daysLeft: z.number().int().min(-50000).max(100000).nullable(), status: state }).strict()).max(20),
  logs: z.array(z.object({ id, item: z.string().trim().min(1).max(30), date, km }).strict()).max(8),
  omittedItems: z.number().int().min(0).max(100000),
}).strict();
export const diagnosisRequestSchema = z.object({ symptom: z.string().trim().min(1).max(1000), situation: z.string().trim().max(100), context: contextSchema }).strict();
export const briefingRequestSchema = z.object({ context: contextSchema }).strict().refine(value => value.context.car !== null, { message: "차량 등록이 필요합니다." });
export const diagnosisResultSchema = z.object({
  summary: shortText,
  priority: z.enum(["urgent", "soon", "routine"]),
  causes: z.array(z.object({ title: z.string().trim().min(1).max(80), explanation: shortText, action: shortText }).strict()).min(1).max(3),
  recommendedActions: z.array(shortText).min(1).max(3),
  needsWorkshop: z.boolean(),
  questions: z.array(shortText).max(2),
  itemIds: z.array(id).max(20),
  logIds: z.array(id).max(8),
}).strict();
export const briefingResultSchema = z.object({
  summary: shortText,
  priorities: z.array(z.object({ itemId: id, reason: shortText, action: shortText }).strict()).max(3),
  historyNotes: z.array(z.object({ logId: id, note: shortText }).strict()).max(3),
  nextActions: z.array(shortText).min(1).max(3),
  missingInformation: z.array(shortText).max(3),
}).strict();
export type AiKind = "diagnosis" | "briefing";
export type AiContext = z.infer<typeof contextSchema>;
export type DiagnosisRequest = z.infer<typeof diagnosisRequestSchema>;
export type BriefingRequest = z.infer<typeof briefingRequestSchema>;
export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;
export type BriefingResult = z.infer<typeof briefingResultSchema>;
export type AiResult = DiagnosisResult | BriefingResult;
export type AiResponse = { kind: AiKind; result: AiResult; context: AiContext; generatedAt: string; model: string; safety: { severity: number; label: string }; cached: boolean };
