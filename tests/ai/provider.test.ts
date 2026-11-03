import test from "node:test";
import assert from "node:assert/strict";
import { generateGemini } from "../../src/lib/ai/provider";

test("공식 SDK 요청 옵션과 구조화 응답을 가짜 HTTP 전송으로 검증 (실호출 아님)", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.ok(String(input).includes("gemini-3.8-flash"));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema);
    assert.equal(body.generationConfig.maxOutputTokens, 3000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
    assert.ok(body.systemInstruction.parts[0].text.includes("확정 진단"));
    assert.equal(body.contents[0].role, "user");
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), { testData: "only-user-data" });
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: '{"mock":true}' }] }, finishReason: "STOP" }] });
  };
  try {
    const result = await generateGemini({ kind: "diagnosis", payload: { testData: "only-user-data" }, apiKey: "mock-key-not-real", model: "gemini-3.8-flash", signal: new AbortController().signal });
    assert.equal(result, '{"mock":true}'); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test("공식 SDK의 429 응답 자동 재시도 비활성화", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: { code: 429, message: "mock quota", status: "RESOURCE_EXHAUSTED" } }, { status: 429 }); };
  try {
    await assert.rejects(() => generateGemini({ kind: "briefing", payload: {}, apiKey: "mock-key-not-real", model: "gemini-3.8-flash", signal: new AbortController().signal }));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
