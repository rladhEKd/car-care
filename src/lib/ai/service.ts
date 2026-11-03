import "server-only";
import { createHash } from "node:crypto";
import { briefingRequestSchema, briefingResultSchema, diagnosisRequestSchema, diagnosisResultSchema, type AiKind, type AiResponse } from "./contracts";
import { diagnose } from "../v2";
import { generateGemini, type GenerateInput } from "./provider";

export const VERIFIED_FREE_MODELS = ["gemini-3.8-flash"] as const;
const MAX_BYTES = 24000;
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
type Environment = Record<string, string | undefined>;
export function aiConfiguration(env: Environment = process.env) {
  if (!env.GEMINI_API_KEY?.trim() || !env.GEMINI_MODEL?.trim()) return { available: false, message: "AI 사용 불가: 서버에 GEMINI_API_KEY와 GEMINI_MODEL 설정이 필요합니다. 기존 규칙 기반 도우미는 사용할 수 있습니다." };
  if (!VERIFIED_FREE_MODELS.some(model => model === env.GEMINI_MODEL)) return { available: false, message: "AI 사용 불가: 무료 티어를 확인한 허용 모델 설정이 필요합니다." };
  if (env.GEMINI_FREE_TIER_CONFIRMED !== "true") return { available: false, message: "AI 사용 불가: 운영자가 Google AI Studio에서 무료 티어·결제 설정을 확인한 후 GEMINI_FREE_TIER_CONFIRMED=true로 설정해야 합니다." };
  return { available: true, message: "Gemini 텍스트 상담 준비됨. 무료 한도 내에서만 사용하세요." };
}
class AiError extends Error { constructor(public status: number, public code: string, message: string, public retryAfter = 0) { super(message); } }
type Dependencies = { generate?: (input: GenerateInput) => Promise<string>; env?: Environment; now?: () => number; timeoutMs?: number };
const hash = (input: string) => createHash("sha256").update(input).digest("hex");
async function readJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) throw new AiError(413, "TOO_LARGE", "요청 데이터가 너무 큽니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new AiError(400, "INVALID_INPUT", "입력값이 필요합니다.");
  let bytes = 0;
  const decoder = new TextDecoder(); let text = "";
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_BYTES) { await reader.cancel(); throw new AiError(413, "TOO_LARGE", "요청 데이터가 너무 큽니다."); } text += decoder.decode(value, { stream: true }); }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (e) { if (e instanceof AiError) throw e; throw new AiError(400, "INVALID_JSON", "올바른 JSON 입력이 필요합니다."); }
}
// Each factory is one instance-local guard/cache. It is not a distributed quota guarantee.
export function createAiHandler(deps: Dependencies = {}) {
  const generate = deps.generate ?? generateGemini, now = deps.now ?? Date.now;
  const clients = new Map<string, { start: number; count: number; last: number }>();
  const cache = new Map<string, { expires: number; value: AiResponse }>();
  const pending = new Set<string>();
  let active = 0, day = "", dailyCalls = 0;
  return async function handle(request: Request, kind: AiKind): Promise<Response> {
    try {
      if (request.method !== "POST") throw new AiError(405, "METHOD", "POST 요청만 허용합니다.");
      const url = new URL(request.url);
      // Next can normalize request.url to an internal hostname behind its server/proxy.
      const publicOrigin = new URL(`${url.protocol}//${request.headers.get("host") ?? url.host}`).origin;
      if (request.headers.get("origin") !== publicOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new AiError(403, "ORIGIN", "동일 사이트에서만 AI 요청을 보낼 수 있습니다.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AiError(415, "CONTENT_TYPE", "JSON 요청만 허용합니다.");
      const raw = await readJson(request);
      const parsed = (kind === "diagnosis" ? diagnosisRequestSchema : briefingRequestSchema).safeParse(raw);
      if (!parsed.success) throw new AiError(400, "INVALID_INPUT", "입력 길이·차량 정보·소모품 데이터 형식을 확인해 주세요. 증상은 1~1,000자입니다.");
      const payload = parsed.data, context = payload.context;
      const ids = context.items.map(item => item.id), logIds = context.logs.map(log => log.id);
      if (new Set(ids).size !== ids.length || new Set(logIds).size !== logIds.length || context.items.some(item => item.nextKm !== item.lastKm + item.interval || (context.car && item.remainingKm !== item.nextKm - context.car.km))) throw new AiError(400, "INVALID_INPUT", "소모품 계산 데이터가 일치하지 않습니다.");
      const env = deps.env ?? process.env, config = aiConfiguration(env);
      if (!config.available) throw new AiError(503, "NOT_CONFIGURED", config.message);
      const stamp = now();
      const client = hash(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local");
      const key = hash(`${client}:${env.GEMINI_MODEL}:${kind}:${JSON.stringify(payload)}`);
      for (const [k, value] of cache) if (value.expires <= stamp) cache.delete(k);
      const cached = cache.get(key);
      if (cached) return Response.json({ ...cached.value, cached: true }, { headers: responseHeaders });
      if (pending.has(key)) throw new AiError(429, "IN_FLIGHT", "동일한 AI 요청이 진행 중입니다. 결과를 기다려 주세요.", 20);
      const utcDay = new Date(stamp).toISOString().slice(0, 10);
      if (day !== utcDay) { day = utcDay; dailyCalls = 0; }
      if (dailyCalls >= 20 || active >= 2) throw new AiError(429, "LOCAL_LIMIT", "AI 요청 보호 한도에 도달했습니다. 잠시 후 직접 다시 요청해 주세요.", 60);
      const previous = clients.get(client);
      if (previous && stamp - previous.start < 600000 && (previous.count >= 4 || stamp - previous.last < 20000)) throw new AiError(429, "COOLDOWN", "연속 요청을 제한하고 있습니다. 잠시 후 직접 다시 요청해 주세요.", previous.count >= 4 ? Math.ceil((600000 - stamp + previous.start) / 1000) : 20);
      if (clients.size >= 200) clients.delete(clients.keys().next().value!);
      clients.set(client, { start: previous && stamp - previous.start < 600000 ? previous.start : stamp, count: previous && stamp - previous.start < 600000 ? previous.count + 1 : 1, last: stamp });
      dailyCalls++; active++; pending.add(key);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      request.signal.addEventListener("abort", cancel, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abortListener: (() => void) | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { reject(new AiError(504, "TIMEOUT", "AI 응답 시간이 초과되었습니다. 자동 재시도하지 않습니다. 잠시 후 직접 다시 요청해 주세요.", 20)); controller.abort(); }, deps.timeoutMs ?? 20000);
          abortListener = () => reject(new AiError(408, "CANCELED", "AI 요청이 취소되었습니다.", 20));
          controller.signal.addEventListener("abort", abortListener, { once: true });
        });
        const content = await Promise.race([generate({ kind, payload, apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL!, signal: controller.signal }), timeout]);
        if (content.length > 12000 || content.includes(env.GEMINI_API_KEY!) || /\d+\s*(%|퍼센트)/.test(content)) throw new AiError(502, "INVALID_RESPONSE", "AI 응답이 검증 기준을 충족하지 못했습니다. 규칙 기반 안내를 확인해 주세요.", 20);
        let json: unknown;
        try { json = JSON.parse(content); } catch { throw new AiError(502, "INVALID_RESPONSE", "AI가 올바른 JSON을 반환하지 않았습니다. 규칙 기반 안내를 확인해 주세요.", 20); }
        const checked = (kind === "diagnosis" ? diagnosisResultSchema : briefingResultSchema).safeParse(json);
        if (!checked.success) throw new AiError(502, "INVALID_RESPONSE", "AI 응답 필드가 검증을 통과하지 못했습니다. 규칙 기반 안내를 확인해 주세요.", 20);
        const result = checked.data;
        const references = "itemIds" in result ? [...result.itemIds.map(value => ["item", value]), ...result.logIds.map(value => ["log", value])] : [...result.priorities.map(value => ["item", value.itemId]), ...result.historyNotes.map(value => ["log", value.logId])];
        if (references.some(([type, value]) => !(type === "item" ? ids : logIds).includes(value))) throw new AiError(502, "UNGROUNDED", "AI가 제공되지 않은 기록을 참조해 결과를 표시하지 않았습니다.", 20);
        const safety = diagnose("symptom" in payload && typeof payload.symptom === "string" ? payload.symptom : "");
        if (safety.severity >= 2 && "priority" in result) { result.priority = "urgent"; result.needsWorkshop = true; }
        const value: AiResponse = { kind, result, context, generatedAt: new Date(stamp).toISOString(), model: env.GEMINI_MODEL!, safety: { severity: safety.severity, label: safety.label }, cached: false };
        if (cache.size >= 20) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: stamp + 600000, value });
        return Response.json(value, { headers: responseHeaders });
      } finally {
        clearTimeout(timer); request.signal.removeEventListener("abort", cancel);
        if (abortListener) controller.signal.removeEventListener("abort", abortListener);
        active--; pending.delete(key);
      }
    } catch (error) {
      let e = error instanceof AiError ? error : null;
      if (!e) {
        const code = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
        e = code === 429 ? new AiError(429, "PROVIDER_QUOTA", "Gemini 무료 할당량 또는 요청 한도에 도달했습니다. AI Studio 할당량을 확인하고 나중에 직접 다시 요청해 주세요.", 60) : code === 408 || code === 504 ? new AiError(504, "TIMEOUT", "Gemini 응답 시간이 초과되었습니다. 자동 재시도하지 않습니다.", 20) : code === 401 || code === 403 ? new AiError(503, "PROVIDER_AUTH", "Gemini API 키 또는 모델 접근 권한을 운영자가 확인해야 합니다.") : new AiError(502, "PROVIDER_ERROR", "Gemini 연결에 실패했습니다. 규칙 기반 도우미는 계속 사용할 수 있습니다.", 20);
      }
      return Response.json({ error: { code: e.code, message: e.message, retryAfter: e.retryAfter } }, { status: e.status, headers: { ...responseHeaders, ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}) } });
    }
  };
}
export const handleAi = createAiHandler();
