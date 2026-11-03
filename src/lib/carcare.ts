export type Car = { name: string; year: number; km: number };
export type Item = { id: string; name: string; icon: string; baseKm: number; interval: number };
export type Maintenance = { id: string; item: string; itemId: string | null; date: string; km: number; cost: number; memo: string };
export type Data = { version: 2; car: Car | null; items: Item[]; logs: Maintenance[]; theme: "auto" | "light" | "dark" };
export const emptyData = (): Data => ({ version: 2, car: null, items: [], logs: [], theme: "auto" });
export const defaults = [
  { name: "엔진오일", icon: "🛢️", interval: 10000 },
  { name: "타이어", icon: "🛞", interval: 50000 },
  { name: "에어컨 필터", icon: "🌬️", interval: 15000 },
  { name: "브레이크 패드", icon: "🛑", interval: 40000 },
  { name: "브레이크액", icon: "💧", interval: 40000 },
];
export const uid = () => crypto.randomUUID();
export const number = (value: number) => value.toLocaleString("ko-KR");
export const money = (value: number) => `${number(value)}원`;
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function integer(value: unknown, label: string, min = 0, max = 10000000): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}: ${number(min)}~${number(max)} 사이의 정수를 입력해 주세요.`);
  return n;
}
export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label}: 공백이 아닌 ${max}자 이내의 값을 입력해 주세요.`);
  return value.trim();
}
export function lastKm(item: Item, logs: Maintenance[]) {
  return logs.reduce((km, log) => log.itemId === item.id ? Math.max(km, log.km) : km, item.baseKm);
}
export function status(item: Item, logs: Maintenance[], km: number) {
  const last = lastKm(item, logs), next = last + item.interval, remaining = next - km;
  const code = remaining < 0 ? "over" : remaining <= 1000 ? "soon" : "ok";
  return { last, next, remaining, code, label: { ok: "정상", soon: "임박", over: "초과" }[code], progress: Math.max(0, Math.min(100, (km - last) / item.interval * 100)) };
}
export const sortedLogs = (logs: Maintenance[]) => [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km || b.id.localeCompare(a.id));
export function saveLog(data: Data, log: Maintenance): Data {
  if (!data.car) throw new Error("차량을 먼저 등록해 주세요.");
  return { ...data, car: { ...data.car, km: Math.max(data.car.km, log.km) }, logs: [...data.logs.filter(l => l.id !== log.id), log] };
}
export function deleteItem(data: Data, id: string): Data {
  return { ...data, items: data.items.filter(i => i.id !== id), logs: data.logs.map(l => l.itemId === id ? { ...l, itemId: null } : l) };
}
export function costSummary(logs: Maintenance[], now = new Date()) {
  const month = today(now).slice(0, 7), year = month.slice(0, 4);
  const months = new Map<string, number>(), categories = new Map<string, number>();
  let total = 0, currentMonth = 0, currentYear = 0;
  for (const log of logs) {
    total += log.cost;
    if (log.date.startsWith(month)) currentMonth += log.cost;
    if (log.date.startsWith(year)) currentYear += log.cost;
    months.set(log.date.slice(0, 7), (months.get(log.date.slice(0, 7)) ?? 0) + log.cost);
    categories.set(log.item, (categories.get(log.item) ?? 0) + log.cost);
  }
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = today(new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)).slice(0, 7);
    return { month: key.slice(2).replace("-", "."), cost: months.get(key) ?? 0 };
  });
  return { total, currentMonth, currentYear, monthly, categories: [...categories].map(([name, cost]) => ({ name, cost })).sort((a, b) => b.cost - a.cost) };
}

// Legacy data is read without overwriting the original HTML's storage key.
export function parseData(raw: string): Data {
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== "object") throw new Error("데이터 형식이 올바르지 않습니다.");
  const d = input as Record<string, unknown>;
  if (d.version !== undefined && d.version !== 2) throw new Error("지원하지 않는 데이터 버전입니다.");
  if (!Array.isArray(d.items) || !Array.isArray(d.logs)) throw new Error("소모품 또는 정비 데이터가 올바르지 않습니다.");
  const legacy = d.version === undefined;
  const car = d.car === null ? null : (() => {
    const c = d.car as Record<string, unknown>;
    return { name: text(c?.name, "차량명", 40), year: integer(c?.year, "연식", 1980, 2100), km: integer(c?.km, "주행거리") };
  })();
  const items: Item[] = d.items.map((value: Record<string, unknown>) => ({ id: text(value.id, "소모품 ID", 100), name: text(value.name, "소모품명", 30), icon: typeof value.icon === "string" ? value.icon.slice(0, 12) : "🔧", baseKm: integer(legacy ? value.lastKm : value.baseKm, "기본 교체 거리"), interval: integer(value.interval, "교체 주기", 1) }));
  const logs: Maintenance[] = d.logs.map((value: Record<string, unknown>) => {
    const item = text(value.item, "정비 항목", 30);
    const itemId = legacy ? items.find(i => i.name === item)?.id ?? null : value.itemId;
    if (itemId !== null && (typeof itemId !== "string" || !items.some(i => i.id === itemId))) throw new Error("정비 기록의 소모품 연결이 올바르지 않습니다.");
    if (typeof value.date !== "string" || !validDate(value.date)) throw new Error("정비 날짜가 올바르지 않습니다.");
    if (typeof value.memo !== "string" || value.memo.length > 100) throw new Error("메모가 올바르지 않습니다.");
    return { id: text(value.id, "정비 ID", 100), item, itemId, date: value.date, km: integer(value.km, "정비 주행거리"), cost: integer(value.cost, "정비 비용", 0, 1000000000), memo: value.memo };
  });
  if (new Set(items.map(i => i.id)).size !== items.length || new Set(logs.map(l => l.id)).size !== logs.length) throw new Error("중복된 데이터 ID가 있습니다.");
  if (!car && (items.length || logs.length)) throw new Error("차량 정보가 없습니다.");
  if (car && [...items.map(i => i.baseKm), ...logs.map(l => l.km)].some(km => km > car.km)) throw new Error("교체·정비 주행거리가 현재 차량 주행거리보다 큽니다.");
  return { version: 2, car, items, logs, theme: d.theme === "dark" || d.theme === "light" ? d.theme : "auto" };
}
export function sampleData(now = new Date()): Data {
  const base = [36000, 20000, 21000, 15000, 10000];
  const items = defaults.map((d, i) => ({ ...d, id: uid(), baseKm: base[i] }));
  const ago = (months: number, day: number) => today(new Date(now.getFullYear(), now.getMonth() - months, Math.min(day, now.getDate())));
  const entries = [
    { index: 0, date: ago(1, 12), km: 46000, cost: 85000, memo: "합성유 교환" },
    { index: 2, date: ago(5, 3), km: 36000, cost: 32000, memo: "" },
    { index: 4, date: ago(4, 20), km: 30000, cost: 45000, memo: "" },
    { index: 0, date: ago(2, 5), km: 41000, cost: 78000, memo: "" },
    { index: 1, date: ago(0, 2), km: 52000, cost: 640000, memo: "4본 교체" },
    { index: 3, date: ago(8, 18), km: 15000, cost: 180000, memo: "전륜" },
  ];
  return { version: 2, car: { name: "현대 쏘나타 DN8", year: 2020, km: 52300 }, items, logs: [...entries.map(({ index, ...log }) => ({ ...log, id: uid(), item: items[index].name, itemId: items[index].id })), { id: uid(), item: "워셔액 보충", itemId: null, date: ago(2, 9), km: 44000, cost: 5000, memo: "" }], theme: "auto" };
}
