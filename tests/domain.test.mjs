import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, costSummary, deleteItem, emptyData, integer, lastDate, lastKm, parseData, sampleData, saveLog, sortedLogs, status, validDate } from "../src/lib/carcare.ts";
import { diagnose, estimateCatalog, estimateRange } from "../src/lib/v2.ts";

const item = { id: "oil", name: "엔진오일", icon: "🛢️", baseKm: 1000, interval: 10000 };
const record = (id, km, extra = {}) => ({ id, item: "엔진오일", itemId: "oil", date: "2026-10-02", km, cost: 80000, memo: "", ...extra });
const fixture = () => ({ ...emptyData(), car: { name: "테스트 차량", year: 2020, km: 12000 }, items: [item], logs: [] });

test("상태 경계: 1001 km 정상, 1000·0 km 임박, -1 km 초과", () => {
  assert.equal(status(item, [], 9999).code, "ok");
  assert.equal(status(item, [], 10000).code, "soon");
  assert.equal(status(item, [], 11000).code, "soon");
  assert.equal(status(item, [], 11001).code, "over");
  assert.equal(status(item, [], 0).progress, 0);
  assert.equal(status(item, [], 20000).progress, 100);
});
test("교체 기록 추가·수정·삭제·연결 변경 후 기준 복구", () => {
  let data = saveLog(fixture(), record("a", 5000));
  data = saveLog(data, record("b", 10000));
  assert.equal(lastKm(item, data.logs), 10000);
  data = saveLog(data, record("b", 4000));
  assert.equal(lastKm(item, data.logs), 5000);
  data = saveLog(data, record("a", 5000, { itemId: null }));
  assert.equal(lastKm(item, data.logs), 4000);
  data = { ...data, logs: data.logs.filter(log => log.id !== "b") };
  assert.equal(lastKm(item, data.logs), 1000);
  assert.equal(data.car.km, 12000);
});
test("소모품 이름 변경은 ID 연결 유지, 삭제는 비용·기록 보존", () => {
  const data = saveLog(fixture(), record("a", 5000));
  assert.equal(lastKm({ ...item, name: "새 이름" }, data.logs), 5000);
  const deleted = deleteItem(data, "oil");
  assert.equal(deleted.items.length, 0);
  assert.equal(deleted.logs[0].itemId, null);
  assert.equal(costSummary(deleted.logs).total, 80000);
});
test("큰 주행거리 정비는 차량에 반영하며 과거 기록은 낮추지 않음", () => {
  let data = saveLog(fixture(), record("a", 15000));
  assert.equal(data.car.km, 15000);
  data = saveLog(data, record("b", 3000));
  assert.equal(data.car.km, 15000);
});
test("누적·월·연도 집계와 연도 경계를 넘는 12개월 차트", () => {
  const logs = [record("a", 1, { date: "2026-11-01", cost: 100 }), record("b", 2, { date: "2026-10-01", cost: 200 }), record("c", 3, { date: "2025-12-31", cost: 300 })];
  const summary = costSummary(logs, new Date(2026, 10, 3));
  assert.equal(summary.total, 600);
  assert.equal(summary.currentMonth, 100);
  assert.equal(summary.currentYear, 300);
  assert.equal(summary.monthly.length, 12);
  assert.equal(summary.monthly[0].month, "25.12");
  assert.equal(summary.categories[0].cost, 600);
  assert.equal(sortedLogs(logs)[0].id, "a");
});
test("기존 HTML 저장 형식 변환 및 원본 객체 보존", () => {
  const legacy = { car: { name: "쏘나타", year: 2020, km: 12000 }, items: [{ id: "oil", name: "엔진오일", icon: "🛢️", lastKm: 1000, interval: 10000 }], logs: [{ id: "a", item: "엔진오일", date: "2026-10-02", km: 8000, cost: 50000, memo: "" }] };
  const data = parseData(JSON.stringify(legacy));
  assert.equal(data.version, 2);
  assert.equal(data.logs[0].itemId, "oil");
  assert.equal(lastKm(data.items[0], data.logs), 8000);
  assert.equal(legacy.items[0].lastKm, 1000);
  assert.deepEqual(parseData(JSON.stringify(data)), data);
});
test("잘못된 날짜·공백·음수·소수·깨진 저장 데이터 거부", () => {
  assert.equal(validDate("2026-02-30"), false);
  for (const value of [-1, 1.2, Infinity, "", " "]) assert.throws(() => integer(value, "거리"));
  assert.throws(() => parseData('{"items":[],"logs":[],"car":{"name":" ","year":2020,"km":0}}'));
  assert.throws(() => parseData(JSON.stringify({ ...fixture(), logs: [record("x", 99999999)] })));
  assert.throws(() => parseData(JSON.stringify({ ...fixture(), logs: [record("x", 1, { itemId: "missing" })] })));
});
test("예시 데이터는 일관되며 저장 후 같은 구조로 복원", () => {
  const data = sampleData(new Date(2026, 10, 3));
  assert.deepEqual(parseData(JSON.stringify(data)), data);
  assert.equal(data.items.length, 5);
  assert.equal(data.logs.length, 7);
});

test("개월 계산: 월말·윤년·연도 경계에서 마지막 유효일로 보정", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
});
test("날짜 상태: 31일 정상, 30일·당일 임박, 하루 경과 초과", () => {
  const dated = { ...item, baseDate: "2026-01-31", intervalMonths: 1 };
  assert.equal(status(dated, [], 1000, "2026-01-28").code, "ok");
  assert.equal(status(dated, [], 1000, "2026-01-29").code, "soon");
  assert.equal(status(dated, [], 1000, "2026-02-28").code, "soon");
  const expired = status(dated, [], 1000, "2026-03-01");
  assert.equal(expired.code, "over");
  assert.equal(expired.daysLeft, -1);
  assert.equal(expired.progress, 100);
  assert.equal(expired.kmCode, "ok");
});
test("거리·날짜 중 더 심각한 상태 선택, 시간 기준 미설정은 기존 거리 동작 유지", () => {
  assert.equal(status({ ...item, baseDate: "2026-01-01", intervalMonths: 12 }, [], 20000, "2026-02-01").code, "over");
  const missing = status({ ...item, intervalMonths: 12 }, [], 1000, "2026-02-01");
  assert.equal(missing.dateDue, null);
  assert.equal(missing.code, "ok");
  assert.equal(status({ ...item, baseDate: "2020-01-01", intervalMonths: 0 }, [], 1000).dateDue, null);
});
test("날짜 기준도 이력 수정·삭제·연결 변경 시 재계산", () => {
  const dated = { ...item, baseDate: "2025-01-01", intervalMonths: 12 };
  let logs = [record("a", 4000, { date: "2026-01-01" }), record("b", 8000, { date: "2026-06-01" })];
  assert.equal(lastDate(dated, logs), "2026-06-01");
  logs = logs.map(l => l.id === "b" ? { ...l, date: "2025-06-01" } : l);
  assert.equal(lastDate(dated, logs), "2026-01-01");
  logs = logs.map(l => l.id === "a" ? { ...l, itemId: null } : l);
  assert.equal(lastDate(dated, logs), "2025-06-01");
  assert.equal(lastDate(dated, []), "2025-01-01");
});
test("기존 v2 데이터는 필드와 값 유지, V2 HTML 날짜 필드도 호환", () => {
  const previous = fixture();
  assert.deepEqual(parseData(JSON.stringify(previous)), previous);
  const legacy = { car: previous.car, items: [{ id: "oil", name: "엔진오일", icon: "🛢️", lastKm: 1000, interval: 10000, lastDate: "2026-01-31", intervalMonths: 12 }], logs: [] };
  const imported = parseData(JSON.stringify(legacy));
  assert.equal(imported.items[0].baseDate, "2026-01-31");
  assert.equal(imported.items[0].intervalMonths, 12);
});
test("예정 견적 저장·복원과 수량 계산은 실제 비용·교체 기준에 영향 없음", () => {
  const entry = estimateCatalog.find(e => e.item === "타이어");
  const plan = { ...entry, id: "plan", quantity: 4, createdDate: "2026-11-03", memo: "4본" };
  const data = { ...saveLog(fixture(), record("a", 5000)), estimates: [plan] };
  const restored = parseData(JSON.stringify(data));
  assert.equal(restored.estimates.length, 1);
  assert.deepEqual(estimateRange(plan), { min: 320000, max: 980000 });
  assert.equal(costSummary(restored.logs).total, 80000);
  assert.equal(lastKm(item, restored.logs), 5000);
  assert.throws(() => parseData(JSON.stringify({ ...data, estimates: [{ ...plan, quantity: -1 }] })));
  assert.throws(() => parseData(JSON.stringify({ ...data, estimates: [{ ...plan, partMin: plan.partMax + 1 }] })));
});
test("선택 날짜·개월 입력 오류는 조용히 무시하지 않고 거부", () => {
  assert.throws(() => parseData(JSON.stringify({ ...fixture(), items: [{ ...item, baseDate: "2026-02-30" }] })));
  assert.throws(() => parseData(JSON.stringify({ ...fixture(), items: [{ ...item, intervalMonths: 1.5 }] })));
  assert.throws(() => parseData(JSON.stringify({ ...fixture(), items: [{ ...item, intervalMonths: 241 }] })));
});
test("진단은 여러 규칙을 매칭하고 화재 위험을 최우선 안내", () => {
  const result = diagnose("브레이크에서 소리가 나고 연기가 납니다. 핸들도 떨려요.");
  assert.equal(result.severity, 3);
  assert.equal(result.matches[0].id, "fire");
  assert.ok(result.matches.some(rule => rule.id === "brake"));
  assert.ok(result.matches.some(rule => rule.id === "steering"));
  assert.equal(diagnose("엔진이 과열되고 수온이 높아요").matches[0].id, "heat");
});
test("일치 규칙 없음과 일반 냉방 안내는 고장 확정 또는 안전 보증을 반환하지 않음", () => {
  assert.equal(diagnose("잘 모르겠어요").matches.length, 0);
  assert.equal(diagnose("에어컨 냉방이 약해요").matches[0].id, "climate");
  assert.equal(diagnose("불편해요").matches.length, 0);
});
