"use client";

import { useState, type FormEvent } from "react";
import { Calculator, Plus } from "lucide-react";
import { integer, money, today, uid, type Data, type EstimatePlan } from "@/lib/carcare";
import { estimateCatalog, estimateRange } from "@/lib/v2";
import { Modal } from "./editor";

export default function Estimates({ data, onSave, onComplete }: { data: Data; onSave: (data: Data) => void; onComplete: (id: string) => void }) {
  const [editing, setEditing] = useState<{ plan: EstimatePlan; data: Data; isNew: boolean } | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const plans = data.estimates ?? [];
  const totals = plans.reduce((sum, plan) => { const range = estimateRange(plan); return { min: sum.min + range.min, max: sum.max + range.max }; }, { min: 0, max: 0 });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError("");
    try {
      if (editing.data !== data) throw new Error("편집 중 데이터가 변경되었습니다. 닫고 다시 편집해 주세요.");
      const form = new FormData(event.currentTarget);
      const quantity = integer(form.get("quantity"), "수량", 1, 20);
      const memo = String(form.get("memo") ?? "").trim();
      if (memo.length > 100) throw new Error("메모는 100자 이내여야 합니다.");
      const plan = { ...editing.plan, quantity, memo };
      onSave({ ...data, estimates: editing.isNew ? [...plans, plan] : plans.map(p => p.id === plan.id ? plan : p) });
      setEditing(null);
    } catch (e) { setError((e as Error).message); }
  }
  return <section><div className="section-heading"><div><p className="eyebrow">MAINTENANCE ESTIMATES</p><h1>정비 예상 견적</h1><p className="subtitle">{data.car?.name} · 차량 세부 규격을 반영하지 않은 참고 범위</p></div><Calculator size={28} className="muted" /></div>
    <div className="banner estimate-notice"><strong>참고용 추정치 · 실제 지출 아님</strong><p>금액은 참고 HTML의 고정 예시이며 실시간 업체 조회나 확정 견적이 아닙니다. 부품 규격·작업 방식·업체에 따라 달라지므로 실제 작업 전에 견적을 확인하세요. 예정 견적은 비용 분석과 누적 정비 비용에 포함하지 않습니다.</p></div>
    <div className="item-grid estimate-grid">{estimateCatalog.map(entry => { const range = estimateRange({ ...entry, quantity: 1 }); return <article className="card estimate-card" key={entry.item}><div className="item-top"><h2>{entry.item}</h2><span className="local-tag">{entry.unit} 기준</span></div><p className="estimate-price">{money(range.min)} ~ {money(range.max)}</p><dl className="details"><dt>부품비</dt><dd>{money(entry.partMin)} ~ {money(entry.partMax)}</dd><dt>공임</dt><dd>{money(entry.laborMin)} ~ {money(entry.laborMax)}</dd></dl><p className="help">{entry.memo}</p><button className="btn sm ghost" onClick={() => { setError(""); setEditing({ plan: { ...entry, id: uid(), quantity: 1, createdDate: today(), memo: "" }, data, isNew: true }); }}><Plus size={14} />예정 견적에 추가</button></article>; })}</div>
    <div className="section-title"><h2>정비 예정 견적 ({plans.length}건)</h2></div><div className="card"><p className="planned-total">예상 합계 {money(totals.min)} ~ {money(totals.max)}</p><p className="subtitle">실제 비용 합계에 포함되지 않습니다. 수량은 표의 단위 기준이며 부품비와 공임에 함께 적용됩니다.</p>{!plans.length ? <div className="empty">예정 견적을 추가해 정비 예산을 계획해 보세요.</div> : <ul className="plan-list">{plans.map(plan => { const range = estimateRange(plan); return <li key={plan.id}><div><strong>{plan.item} × {plan.quantity}</strong><p>{money(range.min)} ~ {money(range.max)}</p><small>{plan.createdDate}{plan.memo ? ` · ${plan.memo}` : ""}</small></div><div className="plan-actions"><button className="btn sm" onClick={() => onComplete(plan.id)}>실제 정비 기록</button><button className="btn sm ghost" onClick={() => { setError(""); setEditing({ plan, data, isNew: false }); }}>수정</button><button className="btn sm danger" onClick={() => { setError(""); setDeleting(plan.id); }}>삭제</button></div></li>; })}</ul>}</div>
    {editing && <Modal title={editing.isNew ? "예정 견적 추가" : "예정 견적 수정"} onClose={() => setEditing(null)}><form className="feature-form" onSubmit={save}><p>{editing.plan.item} · 실제 지출과 별도로 저장합니다.</p><label>수량 (표시 단위 기준)<input name="quantity" type="number" required min={1} max={20} step={1} defaultValue={editing.plan.quantity} /></label><label>견적 메모 (선택)<textarea name="memo" maxLength={100} rows={3} defaultValue={editing.plan.memo} /></label>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>취소</button><button className="btn" type="submit">예정 견적 저장</button></div></form></Modal>}
    {deleting && <Modal title="예정 견적 삭제" onClose={() => setDeleting(null)}><p>이 예정 견적을 삭제할까요? 실제 정비 이력에는 영향을 주지 않습니다.</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="btn ghost" onClick={() => setDeleting(null)}>취소</button><button className="btn" onClick={() => { try { onSave({ ...data, estimates: plans.filter(p => p.id !== deleting) }); setDeleting(null); } catch (e) { setError((e as Error).message); } }}>확인</button></div></Modal>}
  </section>;
}
