import { number, stateRank, status, type Data } from "@/lib/carcare";
import { Badge } from "./maintenance-cards";

export default function Reminders({ data, currentDate, onManage }: { data: Data; currentDate: string; onManage: () => void }) {
  const reminders = data.items.map(item => ({ item, state: status(item, data.logs, data.car?.km ?? 0, currentDate) })).filter(entry => entry.state.code !== "ok").sort((a, b) => stateRank[b.state.code] - stateRank[a.state.code]);
  const missing = data.items.filter(item => item.intervalMonths && !status(item, data.logs, data.car?.km ?? 0, currentDate).dateDue);
  return <section className="reminders"><div className="section-title"><h2>거리·날짜 교체 알림</h2><button className="text-button" onClick={onManage}>알림 기준 설정</button></div><div className="card"><p className="subtitle">{currentDate} 기준 · 앱 안에서 확인하는 알림입니다. 앱을 닫으면 푸시·백그라운드 알림은 보내지 않습니다.</p>{reminders.length ? <ul className="reminder-list">{reminders.map(({ item, state }) => <li key={item.id}><div><strong>{item.name}</strong><p>{state.reason} 기준 점검 필요</p><small>거리: {state.remaining < 0 ? `${number(-state.remaining)} km 초과` : `${number(state.remaining)} km 남음`}{state.dateDue ? ` · 예정일 ${state.dateDue} (${state.daysLeft! < 0 ? `${-state.daysLeft!}일 초과` : `${state.daysLeft}일 남음`})` : ""}</small></div><Badge state={state} /></li>)}</ul> : <div className="empty">현재 설정된 기준에서 임박·초과 항목이 없습니다.</div>}{missing.length > 0 && <p className="help">날짜 미설정: {missing.map(item => item.name).join(", ")}. 기간 주기는 설정되어 있지만 교체 날짜가 없어 날짜 알림을 계산하지 못합니다.</p>}</div></section>;
}
