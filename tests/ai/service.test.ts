import test from "node:test";
import assert from "node:assert/strict";
import { createAiHandler, aiConfiguration } from "../../src/lib/ai/service";
import { makeAiContext } from "../../src/lib/ai/context";
import { sampleData, emptyData } from "../../src/lib/carcare";
import { diagnose } from "../../src/lib/v2";
import type { AiKind, DiagnosisResult, BriefingResult } from "../../src/lib/ai/contracts";
import type { GenerateInput } from "../../src/lib/ai/provider";

const env = { GEMINI_API_KEY: "unit-test-placeholder-not-a-real-key", GEMINI_MODEL: "gemini-3.8-flash", GEMINI_FREE_TIER_CONFIRMED: "true" };
const diagnosis: DiagnosisResult = { summary: "입력 증상의 원인은 추가 점검이 필요합니다.", priority: "routine", causes: [{ title: "부품 마모 가능성", explanation: "증상만으로 확정할 수 없습니다.", action: "전문가 점검을 받으세요." }], recommendedActions: ["정비소에서 확인하세요."], needsWorkshop: false, questions: ["증상이 언제 시작되었나요?"], itemIds: [], logIds: [] };
const briefing: BriefingResult = { summary: "등록 기준에 따라 확인하세요.", priorities: [], historyNotes: [], nextActions: ["소모품 상태를 확인하세요."], missingInformation: ["정확한 차량 사양 확인이 필요합니다."] };
function payload(kind: AiKind = "diagnosis", symptom = "엔진 경고등이 켜져요") { const data = sampleData(new Date(2026, 10, 3)); const context = makeAiContext(data, kind, symptom, "2026-11-03"); return kind === "diagnosis" ? { context, symptom, situation: "주행 중" } : { context }; }
function request(body: unknown, extra: Record<string, string> = {}, signal?: AbortSignal) { return new Request("http://localhost/api/ai/diagnosis", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-forwarded-for": "127.0.0.1", ...extra }, body: JSON.stringify(body), signal }); }
const generated = async (input: GenerateInput) => JSON.stringify(input.kind === "diagnosis" ? diagnosis : briefing);

test("환경 설정 없거나 무료 확인 없는 경우 비활성화, 유료·임의 모델 불허", () => {
  assert.equal(aiConfiguration({}).available, false);
  assert.equal(aiConfiguration({ ...env, GEMINI_FREE_TIER_CONFIRMED: "false" }).available, false);
  assert.equal(aiConfiguration({ ...env, GEMINI_MODEL: "gemini-paid-pro" }).available, false);
  assert.equal(aiConfiguration(env).available, true);
});
test("정상 상담·차량 없음·이력 없음은 지원하되 브리핑은 차량 필수", async () => {
  const handler = createAiHandler({ env, generate: generated });
  const noCar = { symptom: "에어컨 바람이 약해요", situation: "", context: makeAiContext(emptyData(), "diagnosis", "", "2026-11-03") };
  const response = await handler(request(noCar), "diagnosis");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).context.car, null);
  const brief = await handler(request({ context: noCar.context }), "briefing");
  assert.equal(brief.status, 400);
});
test("안전 경고는 AI가 routine·방문불필요를 반환해도 낮추지 않음", async () => {
  const handler = createAiHandler({ env, generate: generated });
  const response = await handler(request(payload("diagnosis", "브레이크가 안 듣고 연기가 납니다")), "diagnosis");
  const body = await response.json();
  assert.equal(body.result.priority, "urgent"); assert.equal(body.result.needsWorkshop, true); assert.equal(body.safety.severity, 3);
  assert.ok(diagnose("심한 출력 저하와 진동").severity >= 2);
  assert.ok(diagnose("출력 이상이 생겼어요").severity >= 2);
});
test("빈 입력·1,000자 초과·차량값·계산값 불일치·추가 필드 거부, SDK 호출 없음", async () => {
  let calls = 0; const handler = createAiHandler({ env, generate: async () => { calls++; return JSON.stringify(diagnosis); } });
  const good = payload();
  for (const body of [{ ...good, symptom: " " }, { ...good, symptom: "a".repeat(1001) }, { ...good, key: "inject" }, { ...good, context: { ...good.context, car: { name: "차량", year: 1800, km: -1 } } }, { ...good, context: { ...good.context, items: good.context.items.map(i => ({ ...i, nextKm: 0 })) } }]) assert.equal((await handler(request(body), "diagnosis")).status, 400);
  assert.equal(calls, 0);
});
test("외부 origin·헤더·JSON·본문 크기 제한 검증", async () => {
  const handler = createAiHandler({ env, generate: generated });
  assert.equal((await handler(request(payload(), { origin: "http://evil.example" }), "diagnosis")).status, 403);
  assert.equal((await handler(request(payload(), { "sec-fetch-site": "cross-site" }), "diagnosis")).status, 403);
  assert.equal((await handler(request(payload(), { "content-type": "text/plain" }), "diagnosis")).status, 415);
  const badJson = new Request("http://localhost/api/ai/diagnosis", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
  assert.equal((await handler(badJson, "diagnosis")).status, 400);
  assert.equal((await handler(request({ data: "x".repeat(25000) }), "diagnosis")).status, 413);
});
test("키 누락은 503이고 SDK를 부르지 않으며 일반 기능 데이터 변경 없음", async () => {
  let calls = 0; const handler = createAiHandler({ env: {}, generate: async () => { calls++; return ""; } });
  const before = payload(); const snapshot = JSON.stringify(before);
  const response = await handler(request(before), "diagnosis");
  assert.equal(response.status, 503); assert.equal(calls, 0); assert.equal(JSON.stringify(before), snapshot);
  assert.equal((await response.json()).error.code, "NOT_CONFIGURED");
});
test("SDK 오류·429·잘못된 JSON·필수필드 누락·잘못된 위험도·긴 응답 처리", async () => {
  const providers = [async () => { throw new Error("upstream-secret-error"); }, async () => { throw { status: 429 }; }, async () => "not-json", async () => "{}", async () => JSON.stringify({ ...diagnosis, priority: "safe-to-drive" }), async () => "x".repeat(12001)];
  for (const [index, generate] of providers.entries()) {
    const response = await createAiHandler({ env, generate })(request(payload()), "diagnosis");
    assert.equal(response.status, index === 1 ? 429 : 502);
    const text = await response.text(); assert.ok(!text.includes("upstream-secret-error")); assert.ok(!text.includes(env.GEMINI_API_KEY));
  }
});
test("타임아웃은 504, SDK 중단 신호 전달, 자동 재시도 없음", async () => {
  let signal: AbortSignal | undefined; let calls = 0;
  const response = await createAiHandler({ env, timeoutMs: 5, generate: input => { signal = input.signal; calls++; return new Promise(() => {}); } })(request(payload()), "diagnosis");
  assert.equal(response.status, 504); assert.equal(signal?.aborted, true); assert.equal(calls, 1);
});
test("없는 기록 참조·API 키·임의 확률 포함 응답은 표시 차단", async () => {
  for (const result of [{ ...diagnosis, logIds: ["invented"] }, { ...diagnosis, summary: env.GEMINI_API_KEY }, { ...diagnosis, summary: "90% 확률입니다" }]) {
    const response = await createAiHandler({ env, generate: async () => JSON.stringify(result) })(request(payload()), "diagnosis"); assert.equal(response.status, 502);
  }
});
test("동일 입력 캐시는 SDK 반복 호출 방지, 다른 입력 연속 요청은 제한", async () => {
  let calls = 0; const handler = createAiHandler({ env, generate: async () => { calls++; return JSON.stringify(diagnosis); } });
  const input = payload();
  assert.equal((await handler(request(input), "diagnosis")).status, 200);
  const cached = await handler(request(input), "diagnosis"); assert.equal((await cached.json()).cached, true); assert.equal(calls, 1);
  assert.equal((await handler(request(payload("diagnosis", "다른 증상")), "diagnosis")).status, 429);
});
test("동일 진행 요청 및 동시 실행 폭주 방지", async () => {
  let finish!: (value: string) => void; let calls = 0;
  const handler = createAiHandler({ env, generate: async () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const input = payload();
  const first = handler(request(input), "diagnosis");
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await handler(request(input), "diagnosis"); assert.equal(second.status, 429); assert.equal((await second.json()).error.code, "IN_FLIGHT");
  finish(JSON.stringify(diagnosis)); assert.equal((await first).status, 200); assert.equal(calls, 1);
});
test("인스턴스 일일 20회 보호 상한", async () => {
  let count = 0; const handler = createAiHandler({ env, generate: async () => { count++; return JSON.stringify(diagnosis); } });
  for (let i = 0; i < 20; i++) assert.equal((await handler(request(payload(), { "x-forwarded-for": `test-ip-${i}` }), "diagnosis")).status, 200);
  assert.equal((await handler(request(payload(), { "x-forwarded-for": "new-ip" }), "diagnosis")).status, 429); assert.equal(count, 20);
});
test("개인정보 최소화: 관련 이력만, 메모·비용·예정견적·사진 제외", () => {
  const data = sampleData(new Date(2026, 10, 3)); const before = JSON.stringify(data);
  const context = makeAiContext(data, "diagnosis", "브레이크 이상", "2026-11-03");
  assert.ok(context.items.every(i => i.name.includes("브레이크")));
  assert.ok(context.logs.every(log => log.item.includes("브레이크")));
  assert.ok(!JSON.stringify(context).includes('"memo"')); assert.ok(!JSON.stringify(context).includes('"cost"'));
  assert.equal(JSON.stringify(data), before);
  assert.equal(makeAiContext(data, "diagnosis", "정보가 없는 증상", "2026-11-03").logs.length, 0);
});
test("브리핑은 기존 계산 상태를 전달하며 항목·이력 ID를 검증", async () => {
  const input = payload("briefing");
  const result = { ...briefing, priorities: [{ itemId: input.context.items[0].id, reason: "제공된 관리 기준에서 확인이 필요합니다.", action: "상태를 점검하세요." }] };
  const response = await createAiHandler({ env, generate: async () => JSON.stringify(result) })(request(input), "briefing");
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).context, input.context);
});
