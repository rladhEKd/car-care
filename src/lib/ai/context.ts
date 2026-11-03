import { sortedLogs, stateRank, status, type Data } from "../carcare";
import { diagnose } from "../v2";
import type { AiContext, AiKind } from "./contracts";

const relatedNames: Record<string, string[]> = { fire: ["엔진", "오일", "배터리", "연료"], heat: ["엔진", "냉각"], brake: ["브레이크"], steering: ["타이어", "휠", "조향", "서스펜션"], tire: ["타이어", "휠"], engine: ["엔진", "점화", "배터리", "연료"], climate: ["에어컨", "필터", "냉매", "히터"] };
export function makeAiContext(data: Data, kind: AiKind, symptom: string, asOf: string): AiContext {
  const words = diagnose(symptom).matches.flatMap(rule => relatedNames[rule.id === "power" ? "engine" : rule.id] ?? []);
  const relevant = (name: string) => words.some(word => name.includes(word)) || symptom.includes(name);
  const items = data.items.filter(item => kind === "briefing" || relevant(item.name)).map(item => {
    const s = status(item, data.logs, data.car?.km ?? 0, asOf);
    return { id: item.id, name: item.name, lastKm: s.last, lastDate: s.lastDate || null, interval: item.interval, intervalMonths: item.intervalMonths ?? 0, nextKm: s.next, remainingKm: s.remaining, dateDue: s.dateDue, daysLeft: s.daysLeft, status: s.code };
  }).sort((a, b) => stateRank[b.status] - stateRank[a.status] || a.remainingKm - b.remainingKm || a.id.localeCompare(b.id));
  return {
    car: data.car ? { name: data.car.name, year: data.car.year, km: data.car.km } : null,
    asOf, items: items.slice(0, 20), omittedItems: Math.max(0, items.length - 20),
    logs: sortedLogs(data.logs).filter(log => kind === "briefing" || relevant(log.item)).slice(0, 8).map(log => ({ id: log.id, item: log.item, date: log.date, km: log.km })),
  };
}
