import { test, expect, type Page } from "@playwright/test";

async function sample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "예시 데이터로 시작" }).click();
  await expect(page.getByRole("heading", { name: "현대 쏘나타 DN8" })).toBeVisible();
}
async function tab(page: Page, name: string) { await page.getByRole("navigation").getByRole("button", { name, exact: true }).click(); }
async function save(page: Page) { await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click(); await expect(page.getByRole("dialog")).toBeHidden(); }

test("차량·소모품·교체 이력 CRUD, 새로고침, 차트, 테마, 모바일", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("button", { name: "차량 등록하기" }).click();
  await page.getByLabel("차량명", { exact: true }).fill("테스트 쏘나타");
  await page.getByLabel("현재 주행거리 (km)").fill("50000");
  await save(page);
  await expect(page.getByRole("heading", { name: "테스트 쏘나타" })).toBeVisible();
  await page.getByRole("button", { name: "주행거리 업데이트" }).click();
  await page.getByLabel("현재 주행거리 (km)").fill("50500");
  await save(page);
  await tab(page, "소모품");
  await page.getByRole("button", { name: "소모품 추가", exact: true }).click();
  await page.getByLabel("소모품 이름").fill("테스트 필터");
  await page.getByLabel("기본 마지막 교체 거리 (km)").fill("40000");
  await page.getByLabel("교체 주기 (km)", { exact: true }).fill("10000");
  await save(page);
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "테스트 필터", exact: true }) });
  await expect(card.getByText("초과", { exact: false }).first()).toBeVisible();
  await card.getByRole("button", { name: "교체 완료", exact: true }).click();
  await page.getByLabel("비용 (원)").fill("30000");
  await page.getByLabel("메모 (선택)").fill("교체 완료 테스트");
  await save(page);
  await expect(card.getByText("50,500 km", { exact: true })).toBeVisible();
  await page.reload();
  await tab(page, "소모품");
  await expect(card.getByText("50,500 km", { exact: true })).toBeVisible();
  await tab(page, "정비 이력");
  await page.getByRole("button", { name: /테스트 필터.*이력 수정/ }).click();
  await page.getByLabel("주행거리 (km)", { exact: true }).fill("49000");
  await page.getByLabel("비용 (원)").fill("35000");
  await save(page);
  await tab(page, "소모품");
  await expect(card.getByText("49,000 km", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "테스트 필터 수정", exact: true }).click();
  await page.getByLabel("소모품 이름").fill("수정된 필터");
  await page.getByLabel("교체 주기 (km)", { exact: true }).fill("12000");
  await save(page);
  await tab(page, "비용 분석");
  await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
  await expect(page.getByText("35,000원", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "화면 테마" }).selectOption("dark");
  await expect(page.locator(".carcare-app")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".carcare-app")).toHaveAttribute("data-theme", "dark");
  await tab(page, "정비 이력");
  await page.getByRole("button", { name: /테스트 필터.*이력 삭제/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  await tab(page, "소모품");
  const renamed = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "수정된 필터", exact: true }) });
  await expect(renamed.getByText("40,000 km", { exact: true })).toBeVisible();
  await renamed.getByRole("button", { name: "수정된 필터 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "수정된 필터" })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const name of ["대시보드", "소모품", "정비 이력", "비용 분석"]) {
    await tab(page, name);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "전체 초기화", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "차량 등록하기" })).toHaveCount(0);
  await page.getByRole("button", { name: "전체 초기화", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "차량 등록하기" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("예시 덮어쓰기 확인, 저장 실패 시 모달과 기존 데이터 보존", async ({ page }) => {
  await sample(page);
  await page.getByRole("button", { name: "예시 데이터 불러오기" }).click();
  await expect(page.getByRole("dialog")).toContainText("덮어씁니다");
  await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "차량 정보 수정", exact: true }).click();
  await page.getByLabel("차량명", { exact: true }).fill("저장 실패 차량");
  await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("저장에 실패");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "현대 쏘나타 DN8" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "현대 쏘나타 DN8" })).toBeVisible();
});

test("오래된 탭 편집 방지, 기존 HTML 데이터 변환, 손상 데이터 보존", async ({ page, context }) => {
  const legacy = JSON.stringify({ car: { name: "기존 차량", year: 2020, km: 10000 }, items: [{ id: "oil", name: "엔진오일", icon: "🛢️", lastKm: 0, interval: 10000 }], logs: [{ id: "a", item: "엔진오일", date: "2026-01-01", km: 8000, cost: 50000, memo: "" }] });
  await page.goto("/");
  await page.evaluate(value => localStorage.setItem("carcare.v1", value), legacy);
  await page.reload();
  await expect(page.getByRole("heading", { name: "기존 차량" })).toBeVisible();
  await page.getByRole("button", { name: "차량 정보 수정", exact: true }).click();
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "차량 정보 수정", exact: true }).click();
  await second.getByLabel("차량명", { exact: true }).fill("다른 탭 차량");
  await save(second);
  await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("데이터가 변경");
  expect(await page.evaluate(() => localStorage.getItem("carcare.v1"))).toBe(legacy);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("carcare.v2", "broken-json"));
  await page.reload();
  await expect(page.locator(".banner[role=alert]")).toContainText("읽을 수 없습니다");
  expect(await page.evaluate(() => localStorage.getItem("carcare.v2"))).toBe("broken-json");
});

test("예시 대시보드와 모바일 비용 차트 레이아웃", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await sample(page);
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("combobox", { name: "화면 테마" }).selectOption("dark");
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile-dark.png"), fullPage: true });
  await tab(page, "비용 분석");
  await expect(page.locator(".recharts-surface")).toHaveCount(2);
  for (const chart of await page.locator(".recharts-surface").all()) {
    const bounds = await chart.boundingBox();
    expect(bounds!.width).toBeGreaterThan(200);
    expect(bounds!.height).toBeGreaterThan(150);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cost-mobile-dark.png"), fullPage: true });
});
