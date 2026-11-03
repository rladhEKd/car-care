import { Check, Pencil, Trash2 } from "lucide-react";
import { money, number, status, type Item, type Maintenance } from "@/lib/carcare";

export function Badge({ state }: { state: ReturnType<typeof status> }) {
  return <span className={`badge ${state.code}`}><span aria-hidden="true">●</span> {state.label}</span>;
}
export function ItemCard({ item, logs, km, onDone, onEdit, onDelete }: { item: Item; logs: Maintenance[]; km: number; onDone?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const state = status(item, logs, km);
  return <article className="card item-card">
    <div className="item-top"><span className="item-icon" aria-hidden="true">{item.icon}</span><h3>{item.name}</h3><Badge state={state} /></div>
    <div className="progress" role="progressbar" aria-label={`${item.name} 교체 주기 진행률`} aria-valuenow={Math.round(state.progress)} aria-valuemin={0} aria-valuemax={100}><span className={state.code} style={{ width: `${state.progress}%` }} /></div>
    <dl className="details"><dt>다음 교체 예정</dt><dd>{number(state.next)} km</dd><dt>{state.remaining < 0 ? "초과 거리" : "남은 거리"}</dt><dd className={`text-${state.kmCode}`}>{number(Math.abs(state.remaining))} km</dd><dt>마지막 교체</dt><dd>{number(state.last)} km</dd><dt>교체 주기</dt><dd>{number(item.interval)} km</dd>
      {!!item.intervalMonths && <><dt>기간 교체 주기</dt><dd>{item.intervalMonths}개월</dd><dt>마지막 교체 날짜</dt><dd>{state.lastDate || "날짜 미설정"}</dd><dt>기간 기준 예정일</dt><dd>{state.dateDue ?? "날짜 미설정"}</dd>{state.daysLeft !== null && <><dt>기간 상태</dt><dd className={`text-${state.dateCode}`}>{state.daysLeft < 0 ? `${number(-state.daysLeft)}일 초과` : state.daysLeft === 0 ? "오늘 교체 예정" : `${number(state.daysLeft)}일 남음`}</dd></>}</>}
    </dl>
    {state.reason && <p className={`reminder-reason text-${state.code}`}>{state.reason} 기준 {state.label}</p>}
    {onDone && <div className="item-actions"><button className="btn sm" onClick={onDone}><Check size={14} />교체 완료</button><button className="btn sm ghost" onClick={onEdit} aria-label={`${item.name} 수정`}><Pencil size={14} />수정</button><button className="btn sm danger" onClick={onDelete} aria-label={`${item.name} 삭제`}><Trash2 size={14} />삭제</button></div>}
  </article>;
}
export function LogList({ logs, itemIds, onEdit, onDelete }: { logs: Maintenance[]; itemIds: string[]; onEdit?: (id: string) => void; onDelete?: (id: string) => void }) {
  if (!logs.length) return <div className="empty">아직 정비 이력이 없습니다. 첫 정비를 기록해 보세요.</div>;
  return <ul className="log-list">{logs.map(log => <li key={log.id} className="log-row"><div className="log-marker" aria-hidden="true">🔧</div><div className="log-info"><strong>{log.item}</strong><span>{log.date} · {number(log.km)} km</span>{log.memo && <p>{log.memo}</p>}{log.itemId && itemIds.includes(log.itemId) && <small>소모품 교체 기준 연동</small>}</div><strong className="log-cost">{money(log.cost)}</strong>{onEdit && <div className="log-actions"><button className="btn sm ghost" onClick={() => onEdit(log.id)} aria-label={`${log.item} ${log.date} 이력 수정`}>수정</button><button className="btn sm danger" onClick={() => onDelete?.(log.id)} aria-label={`${log.item} ${log.date} 이력 삭제`}>삭제</button></div>}</li>)}</ul>;
}
