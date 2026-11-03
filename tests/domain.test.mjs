import test from "node:test";
import assert from "node:assert/strict";
import { costSummary, deleteItem, emptyData, integer, lastKm, parseData, sampleData, saveLog, sortedLogs, status, validDate } from "../src/lib/carcare.ts";

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
