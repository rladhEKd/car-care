"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { defaults, integer, lastKm, number, saveLog, text, today, uid, validDate, type Data } from "@/lib/carcare";

export type EditorMode = { kind: "car" } | { kind: "item"; id?: string } | { kind: "log"; id?: string; itemId?: string; estimateId?: string };
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}>
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>{children}
  </dialog>;
}
function Field({ label, name, value, type = "text", min, max, maxLength, required = true }: { label: string; name: string; value: string | number; type?: string; min?: number | string; max?: number | string; maxLength?: number; required?: boolean }) {
  return <label>{label}<input name={name} type={type} defaultValue={value} min={min} max={max} maxLength={maxLength} required={required} step={type === "number" ? 1 : undefined} /></label>;
}
export default function Editor({ mode, data, onSave, onClose }: { mode: EditorMode; data: Data; onSave: (data: Data) => void; onClose: () => void }) {
  const item = mode.kind === "item" ? data.items.find(i => i.id === mode.id) : undefined;
  const log = mode.kind === "log" ? data.logs.find(l => l.id === mode.id) : undefined;
  const plan = mode.kind === "log" ? data.estimates?.find(e => e.id === mode.estimateId) : undefined;
  const preItem = mode.kind === "log" ? data.items.find(i => i.id === (log?.itemId ?? mode.itemId) || (plan && i.name === plan.item)) : undefined;
  const [linkedId, setLinkedId] = useState(log?.itemId ?? preItem?.id ?? "");
  const [logName, setLogName] = useState(log?.item ?? preItem?.name ?? plan?.item ?? "");
  const [error, setError] = useState("");
  const title = mode.kind === "car" ? (data.car ? "차량 정보·주행거리 수정" : "차량 등록") : mode.kind === "item" ? (item ? "소모품 수정" : "소모품 추가") : mode.kind === "log" && mode.itemId ? "소모품 교체 완료" : log ? "정비 이력 수정" : "정비 이력 등록";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const get = (name: string) => form.get(name);
      let next: Data = data;
      if (mode.kind === "car") {
        const car = { name: text(get("name"), "차량명", 40), year: integer(get("year"), "연식", 1980, 2100), km: integer(get("km"), "현재 주행거리") };
        const highest = Math.max(0, ...data.logs.map(l => l.km), ...data.items.map(i => i.baseKm));
        if (car.km < highest) throw new Error(`현재 주행거리는 저장된 정비·교체 거리(${number(highest)} km)보다 작을 수 없습니다.`);
        if (data.car && car.km < data.car.km && !window.confirm("현재 주행거리를 줄일까요? 입력 오류를 수정하는 경우에만 진행해 주세요.")) return;
        next = { ...data, car, items: !data.car && !data.items.length ? defaults.map(d => ({ ...d, id: uid(), baseKm: car.km })) : data.items };
      } else if (mode.kind === "item") {
        const name = text(get("name"), "소모품명", 30);
        if (data.items.some(i => i.id !== item?.id && i.name === name)) throw new Error("같은 이름의 소모품이 이미 있습니다.");
        const baseKm = integer(get("baseKm"), "기본 교체 거리");
        if (baseKm > (data.car?.km ?? 0)) throw new Error("교체 거리는 현재 주행거리보다 클 수 없습니다.");
        const baseDate = String(get("baseDate") ?? "");
        if (baseDate && (!validDate(baseDate) || baseDate > today() || baseDate < "1980-01-01")) throw new Error("마지막 교체 날짜는 1980년 이후부터 오늘까지여야 합니다.");
        const intervalMonths = integer(get("intervalMonths"), "기간 교체 주기", 0, 240);
        const updated = { id: item?.id ?? uid(), icon: item?.icon ?? defaults.find(d => d.name === name)?.icon ?? "🔧", name, baseKm, baseDate, intervalMonths, interval: integer(get("interval"), "교체 주기", 1) };
        next = { ...data, items: item ? data.items.map(i => i.id === item.id ? updated : i) : [...data.items, updated] };
      } else {
        const date = String(get("date"));
        if (!validDate(date) || date > today() || date < "1980-01-01") throw new Error("정비 날짜는 1980년 이후부터 오늘까지의 유효한 날짜여야 합니다.");
        if (linkedId && !data.items.some(i => i.id === linkedId)) throw new Error("연결할 소모품이 없습니다.");
        const memo = String(get("memo") ?? "").trim();
        if (memo.length > 100) throw new Error("메모는 100자 이내로 입력해 주세요.");
        next = saveLog(data, { id: log?.id ?? uid(), item: text(logName, "정비 항목", 30), itemId: linkedId || null, date, km: integer(get("km"), "정비 주행거리"), cost: integer(get("cost"), "정비 비용", 0, 1000000000), memo });
        if (plan) next = { ...next, estimates: data.estimates?.filter(e => e.id !== plan.id) };
      }
      onSave(next);
    } catch (error) { setError(error instanceof Error ? error.message : "입력값을 확인해 주세요."); }
  }
  return <Modal title={title} onClose={onClose}><form onSubmit={submit}>
    {mode.kind === "car" && <>
      <Field label="차량명" name="name" value={data.car?.name ?? ""} maxLength={40} />
      <div className="form-grid"><Field label="연식" name="year" type="number" min={1980} max={2100} value={data.car?.year ?? new Date().getFullYear()} /><Field label="현재 주행거리 (km)" name="km" type="number" min={0} max={10000000} value={data.car?.km ?? 0} /></div>
      {!data.car && <p className="help">기본 소모품 5개가 추가됩니다. 초기 교체 기준은 등록 주행거리로 설정되니 실제 마지막 교체 거리로 수정해 주세요.</p>}
    </>}
    {mode.kind === "item" && <>
      <Field label="소모품 이름" name="name" value={item?.name ?? ""} maxLength={30} />
      <Field label="기본 마지막 교체 거리 (km)" name="baseKm" type="number" min={0} max={data.car?.km ?? 0} value={item?.baseKm ?? data.car?.km ?? 0} />
      <Field label="교체 주기 (km)" name="interval" type="number" min={1} max={10000000} value={item?.interval ?? 10000} />
      <Field label="기본 마지막 교체 날짜 (선택)" name="baseDate" type="date" min="1980-01-01" max={today()} value={item?.baseDate ?? ""} required={false} />
      <Field label="기간 교체 주기 (개월, 0은 사용 안 함)" name="intervalMonths" type="number" min={0} max={240} value={item?.intervalMonths ?? 0} />
      <p className="help">교체 기준은 기본 거리와 연결된 교체 이력 중 가장 큰 주행거리입니다.{item && ` 현재 기준: ${number(lastKm(item, data.logs))} km.`} 기록을 정정하려면 정비 이력도 수정해 주세요.</p>
      <p className="help">기간 기준은 기본 날짜와 연결된 교체 이력 중 가장 최근 날짜로 계산합니다. 날짜와 개월 수가 모두 있어야 활성화되며, 날짜가 없으면 날짜 미설정으로 안내합니다. 거리·날짜 중 더 시급한 상태를 표시합니다. 교체 주기는 예시 값입니다.</p>
    </>}
    {mode.kind === "log" && <>
      <label>정비 항목<input value={logName} onChange={e => setLogName(e.target.value)} required maxLength={30} /></label>
      <label>교체 기준을 갱신할 소모품<select value={linkedId} onChange={e => { setLinkedId(e.target.value); const selected = data.items.find(i => i.id === e.target.value); if (selected) setLogName(selected.name); }}><option value="">연결 안 함 (일반 정비)</option>{data.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <div className="form-grid"><Field label="정비 날짜" name="date" type="date" min="1980-01-01" max={today()} value={log?.date ?? today()} /><Field label="주행거리 (km)" name="km" type="number" min={0} max={10000000} value={log?.km ?? data.car?.km ?? 0} /></div>
      {plan && <p className="help">예상 견적은 지출이 아닙니다. 실제 작업 후 지불한 비용을 직접 입력하세요. 저장하면 예정 목록에서 제거되고 실제 정비 이력으로 반영됩니다. 취소하면 예정 견적은 유지됩니다.</p>}
      <Field label="비용 (원)" name="cost" type="number" min={0} max={1000000000} value={log?.cost ?? (plan ? "" : 0)} />
      <label>메모 (선택)<textarea name="memo" maxLength={100} rows={3} defaultValue={log?.memo ?? (plan ? `예정 견적에서 실제 정비 기록 (${plan.quantity}단위)` : "")} /></label>
      <p className="help">소모품을 연결하면 교체 이력으로 반영됩니다. 수정·삭제·연결 변경 시 교체 기준도 다시 계산합니다. 현재보다 큰 정비 주행거리는 차량에도 반영됩니다.</p>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>취소</button><button type="submit" className="btn">저장</button></div>
  </form></Modal>;
}
