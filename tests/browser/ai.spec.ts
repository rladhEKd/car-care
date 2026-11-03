import { test, expect, type Page } from "@playwright/test";

const carData = () => ({ version: 2, car: { name: "AI 테스트 차량", year: 2020, km: 10000 }, items: [{ id: "oil", name: "엔진오일", icon: "🛢️", baseKm: 0, interval: 10000 }, { id: "brake", name: "브레이크 패드", icon: "🛑", baseKm: 0, interval: 20000 }], logs: [{ id: "climate", item: "에어컨 필터", itemId: null, date: "2026-01-01", km: 9000, cost: 50000, memo: "전송하면 안 되는 메모" }], estimates: [{ id: "plan", item: "타이어", quantity: 1, partMin: 70000, partMax: 220000, laborMin: 10000, laborMax: 25000, memo: "예정", createdDate: "2026-01-01" }], theme: "light" });
const diagnosis = { summary: "증상을 참고한 모의 AI 상담입니다.", priority: "routine", causes: [{ title: "부품 마모 가능성", explanation: "확정 진단이 아닌 가설입니다.", action: "정비소 점검을 받으세요." }], recommendedActions: ["전문가에게 증상을 설명하세요."], needsWorkshop: false, questions: ["언제 발생했나요?"], itemIds: [], logIds: [] };
const briefing = { summary: "엔진오일 관리 상태를 확인할 시점입니다.", priorities: [{ itemId: "oil", reason: "앱에서 임박으로 계산했습니다.", action: "엔진오일 상태를 점검하세요." }], historyNotes: [], nextActions: ["설명서와 전문가 의견을 확인하세요."], missingInformation: ["차량의 상세 사양을 확인하세요."] };
async function tab(page: Page, name: string) { await page.getByRole("navigation").getByRole("button", { name, exact: true }).click(); }
async function available(page: Page) { await page.route("**/api/ai/status", route => route.fulfill({ json: { available: true, message: "모의 AI 서버 준비됨" } })); }
async function seed(page: Page) { await page.goto("/"); await page.evaluate(data => localStorage.setItem("carcare.v2", JSON.stringify(data)), carData()); await page.reload(); await expect(page.getByRole("heading", { name: "AI 테스트 차량" })).toBeVisible(); }

test("AI 브리핑 명시적 요청·중복 차단·메모리 재사용·복사·오래된 결과", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.install({ time: new Date("2026-11-03T12:00:00+09:00") });
  await available(page);
  let calls = 0;
  await page.route("**/api/ai/briefing", async route => {
    calls++; const payload = route.request().postDataJSON();
    expect(JSON.stringify(payload)).not.toContain("전송하면 안 되는 메모");
    expect(payload.context.logs[0]).not.toHaveProperty("cost");
    await route.fulfill({ json: { kind: "briefing", result: briefing, context: payload.context, model: "gemini-3.8-flash", generatedAt: "2026-11-03T03:00:00Z", safety: { severity: 0, label: "일반" }, cached: false } });
  });
  await seed(page);
  expect(calls).toBe(0);
  const region = page.getByRole("region", { name: "AI 정비 브리핑", exact: true });
  const button = region.getByRole("button", { name: "AI 정비 브리핑 생성" });
  await expect(button).toBeEnabled();
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(region).toContainText(briefing.summary);
  expect(calls).toBe(1);
  await region.getByRole("button", { name: "결과 복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(briefing.summary);
  await page.clock.runFor(21000);
  await region.getByRole("button", { name: "동일 결과 다시 보기 (재호출 없음)" }).click();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "차량 정보 수정", exact: true }).click();
  await page.getByLabel("현재 주행거리 (km)").fill("11000");
  await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
  await expect(region).toContainText("오래된 결과입니다");
  expect(calls).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("ai-briefing-desktop.png"), fullPage: true });
  await page.reload();
  expect(calls).toBe(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("carcare.v2")!));
  expect(stored.logs).toEqual(carData().logs); expect(stored.estimates).toEqual(carData().estimates);
});

test("증상 AI 실패에도 즉시 안전 경고와 기존 규칙 동작·관련 데이터만 전송", async ({ page }) => {
  await available(page); let calls = 0;
  await page.route("**/api/ai/diagnosis", async route => {
    calls++; const payload = route.request().postDataJSON();
    expect(payload.context.logs).toEqual([]);
    expect(payload.context.items.map((i: { name: string }) => i.name)).toEqual(["브레이크 패드"]);
    expect(JSON.stringify(payload)).not.toContain("전송하면 안 되는 메모");
    await route.fulfill({ status: 429, json: { error: { code: "PROVIDER_QUOTA", message: "무료 할당량을 초과했습니다.", retryAfter: 60 } } });
  });
  await seed(page); await tab(page, "증상 진단");
  expect(calls).toBe(0);
  await page.getByLabel("어떤 문제가 발생했나요?").fill("브레이크가 안 들어요");
  await expect(page.locator(".urgent-safety")).toContainText("AI 응답을 기다리지 말고");
  const region = page.getByRole("region", { name: "Gemini AI 증상 상담", exact: true });
  await expect(region.getByRole("button", { name: "AI 증상 상담 요청" })).toBeEnabled();
  await region.getByRole("button", { name: "AI 증상 상담 요청" }).click();
  await expect(region.getByRole("alert")).toContainText("무료 할당량");
  await expect(region.getByRole("button", { name: /초 후 직접 요청 가능/ })).toBeDisabled();
  await page.getByRole("button", { name: "규칙 기반 안내 보기" }).click();
  await expect(page.getByRole("region", { name: "규칙 기반 안내 결과" })).toContainText("제동 계통 점검");
  await expect(page.locator(".urgent-safety")).toBeVisible(); expect(calls).toBe(1);
});

test("AI 응답이 낮은 위험도를 말해도 경고 우선, 입력 변경 시 과거 결과 표시·모바일", async ({ page }, testInfo) => {
  await available(page);
  await page.route("**/api/ai/diagnosis", async route => { const input = route.request().postDataJSON(); await route.fulfill({ json: { kind: "diagnosis", result: diagnosis, context: input.context, model: "gemini-3.8-flash", generatedAt: "2026-11-03T03:00:00Z", safety: { severity: 0, label: "모의" }, cached: false } }); });
  await seed(page); await tab(page, "증상 진단");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("어떤 문제가 발생했나요?").fill("연기가 나요");
  const region = page.getByRole("region", { name: "Gemini AI 증상 상담", exact: true });
  await expect(region.getByRole("button", { name: "AI 증상 상담 요청" })).toBeEnabled();
  await region.getByRole("button", { name: "AI 증상 상담 요청" }).click();
  await expect(region).toContainText("안전 우선·즉시 점검");
  await expect(page.locator(".urgent-safety")).toBeVisible();
  await page.getByLabel("어떤 문제가 발생했나요?").fill("에어컨 바람이 약해요");
  await expect(region).toContainText("오래된 결과입니다");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath("ai-diagnosis-mobile.png"), fullPage: true });
});

test("차량 미등록·빈 증상·API 미설정 상태에서 V2 안내 유지", async ({ page, request }) => {
  await page.goto("/"); await tab(page, "증상 진단");
  await expect(page.getByRole("heading", { name: "차량 증상 진단 도우미" })).toBeVisible();
  const status = await request.get("/api/ai/status"); expect(status.ok()).toBe(true);
  const configuration = await status.json();
  if (!configuration.available) await expect(page.getByRole("region", { name: "Gemini AI 증상 상담" })).toContainText("AI 사용 불가");
  await available(page); await page.reload(); await tab(page, "증상 진단");
  const region = page.getByRole("region", { name: "Gemini AI 증상 상담", exact: true });
  await expect(region.getByRole("button", { name: "AI 증상 상담 요청" })).toBeEnabled();
  await region.getByRole("button", { name: "AI 증상 상담 요청" }).click();
  await expect(region.getByRole("alert")).toContainText("1~1,000자");
  const invalid = await request.post("/api/ai/diagnosis", { data: { symptom: "" }, headers: { origin: "http://127.0.0.1:3001" } });
  expect(invalid.status()).toBe(400);
  if (!configuration.available) {
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/ai/diagnosis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symptom: "에어컨 바람이 약합니다", situation: "", context: { car: null, asOf: "2026-11-03", items: [], logs: [], omittedItems: 0 } }) });
      return { status: result.status, body: await result.json() };
    });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("NOT_CONFIGURED");
  }
});
