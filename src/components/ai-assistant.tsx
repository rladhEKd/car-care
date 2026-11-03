"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle, Sparkles } from "lucide-react";
import { briefingResultSchema, contextSchema, diagnosisResultSchema, type AiContext, type AiKind, type AiResponse, type BriefingResult, type DiagnosisResult } from "@/lib/ai/contracts";
import { makeAiContext } from "@/lib/ai/context";
import { diagnose } from "@/lib/v2";
import { number, type Data } from "@/lib/carcare";
import { useLocalDate } from "@/lib/use-local-date";

// Ephemeral, bounded tab memory only. Never written into maintenance data or localStorage.
const cache = new Map<string, { value: AiResponse; expires: number }>();
const cachedResponse = (key: string) => { const prior = cache.get(key); return prior && prior.expires > Date.now() ? prior.value : null; };
function rememberResponse(key: string, value: AiResponse) { if (cache.size >= 5) cache.delete(cache.keys().next().value!); cache.set(key, { value, expires: Date.now() + 600000 }); }
export function clearAiMemory() { cache.clear(); }
function contextLabel(context: AiContext) {
  return context.car ? `${context.car.name} · ${context.car.year}년식 · ${number(context.car.km)} km` : "차량 정보 없음 (일반 안내)";
}
export default function AiAssistant({ data, kind, symptom = "", situation = "" }: { data: Data; kind: AiKind; symptom?: string; situation?: string }) {
  const date = useLocalDate();
  const context = makeAiContext(data, kind, symptom, date);
  const payload = kind === "diagnosis" ? { symptom: symptom.trim(), situation, context } : { context };
  // Whole vehicle data is used only for local stale detection; the request uses the minimized payload.
  const dataRevision = JSON.stringify({ car: data.car, items: data.items, logs: data.logs, date });
  const key = JSON.stringify({ kind, payload });
  const [availability, setAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [answer, setAnswer] = useState<{ response: AiResponse; key: string; revision: string } | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const stale = Boolean(answer && (answer.key !== key || answer.revision !== dataRevision));
  const safety = kind === "diagnosis" ? diagnose(symptom) : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (typeof result.available !== "boolean" || typeof result.message !== "string") throw new Error();
      setAvailability(result);
    }).catch(() => { if (!controller.signal.aborted) setAvailability({ available: false, message: "AI 설정을 확인할 수 없습니다. 규칙 기반 안내를 이용해 주세요." }); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  async function requestAi() {
    if (busy.current || cooldown > 0 || !availability?.available) return;
    if (kind === "diagnosis" && (!symptom.trim() || symptom.length > 1000)) { setError("증상을 1~1,000자로 입력해 주세요."); return; }
    if (kind === "briefing" && !data.car) { setError("브리핑을 생성하려면 차량을 등록해 주세요."); return; }
    setError(""); setCopyMessage("");
    const prior = cachedResponse(key);
    if (prior) { setAnswer({ response: { ...prior, cached: true }, key, revision: dataRevision }); return; }
    busy.current = true; setLoading(true);
    const controller = new AbortController(); abort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/ai/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        const retry = Number(body.error?.retryAfter);
        setCooldown(Math.min(600, Math.max(20, Number.isFinite(retry) ? retry : 20)));
        throw new Error(typeof body.error?.message === "string" ? body.error.message.slice(0, 400) : "AI 요청에 실패했습니다.");
      }
      const checked = (kind === "diagnosis" ? diagnosisResultSchema : briefingResultSchema).safeParse(body.result);
      if (body.kind !== kind || !checked.success || !contextSchema.safeParse(body.context).success || typeof body.generatedAt !== "string" || !Number.isFinite(Date.parse(body.generatedAt))) throw new Error("AI 응답 형식을 확인할 수 없습니다.");
      const value: AiResponse = { ...body, result: checked.data };
      rememberResponse(key, value);
      setAnswer({ response: value, key, revision: dataRevision });
      setCooldown(20);
    } catch (e) {
      setError(controller.signal.aborted ? "AI 응답 시간이 초과되었거나 요청이 취소되었습니다. 자동 재시도하지 않습니다." : e instanceof Error ? e.message : "AI 연결에 실패했습니다.");
      setCooldown(value => Math.max(value, 20));
    } finally { window.clearTimeout(timeout); busy.current = false; setLoading(false); }
  }
  async function copy() {
    if (!answer) return;
    try {
      const response = answer.response;
      const labels = "causes" in response.result ? [response.result.summary, ...response.result.causes.map(cause => `가설: ${cause.title}\n${cause.explanation}\n조치: ${cause.action}`), ...response.result.recommendedActions, ...response.result.questions] : [response.result.summary, ...response.result.priorities.map(item => `${response.context.items.find(i => i.id === item.itemId)?.name ?? "항목"}: ${item.reason}\n${item.action}`), ...response.result.nextActions, ...response.result.missingInformation];
      await navigator.clipboard.writeText(["CarCare Gemini AI 참고 안내 — 실제 차량을 검사한 결과가 아닙니다.", stale ? "주의: 오래된 결과입니다." : "", safety && safety.severity >= 2 ? `${safety.label}: 안전하게 정차하고 운행을 중단한 뒤 전문가 점검을 받으세요.` : "", contextLabel(response.context), `데이터 기준: ${response.context.asOf}`, ...labels].filter(Boolean).join("\n\n"));
      setCopyMessage("결과를 복사했습니다.");
    } catch { setCopyMessage("복사하지 못했습니다. 브라우저 클립보드 권한을 확인해 주세요."); }
  }
  const result = answer?.response.result;
  return <section className="card ai-card" aria-label={kind === "briefing" ? "AI 정비 브리핑" : "Gemini AI 증상 상담"}>
    <div className="section-title ai-title"><h2><Sparkles size={19} />{kind === "briefing" ? "AI 맞춤형 정비 브리핑" : "Gemini AI 증상 상담"}</h2><span className="badge ai-badge">Gemini</span></div>
    <p className="subtitle">AI가 실제 차량을 검사한 결과가 아닙니다. {kind === "briefing" ? "앱에서 계산한 관리 상태를 참고해 점검 우선순위를 설명합니다." : "가능한 원인은 확정 진단이 아닌 가설입니다. 위험 경고를 우선 확인하세요."}</p>
    <p className="help">버튼을 누를 때만 증상·선별한 차량 정보가 Google Gemini로 전송됩니다. 사진·메모·비용·예정 견적은 전송하지 않습니다. 무료 티어 입력은 Google의 서비스 개선에 사용될 수 있으므로 개인정보를 적지 마세요.</p>
    <p className="ai-context">전송 범위: {contextLabel(context)} · 소모품 {context.items.length}개 · 정비 이력 {context.logs.length}건{context.omittedItems > 0 ? ` (소모품 ${context.omittedItems}개는 입력 제한으로 제외)` : ""}</p>
    <p className="subtitle" role="status">{availability?.message ?? "AI 서버 설정 확인 중…"}</p>
    {error && <p className="error ai-error" role="alert">{error} 기존 규칙 기반 안내는 계속 사용할 수 있습니다.</p>}
    <div className="ai-actions"><button type="button" className="btn" disabled={loading || !availability?.available || cooldown > 0 || (kind === "briefing" && !data.car)} onClick={requestAi}>{loading ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{loading ? "AI 응답을 기다리는 중…" : cooldown > 0 ? `${cooldown}초 후 직접 요청 가능` : answer && !stale ? "동일 결과 다시 보기 (재호출 없음)" : error ? "AI 요청 다시 시도" : kind === "briefing" ? "AI 정비 브리핑 생성" : "AI 증상 상담 요청"}</button>{answer && <button className="btn ghost" type="button" onClick={copy}><Copy size={15} />결과 복사</button>}</div>
    {copyMessage && <p className="subtitle" role="status">{copyMessage}</p>}
    {answer && result && <div className="ai-result" aria-label="AI 참고 결과" aria-live="polite">
      {stale && <div className="banner estimate-notice"><strong>오래된 결과입니다</strong><p>차량 데이터 또는 입력이 변경되었습니다. 아래 결과는 당시 자료에 대한 안내입니다. 새 정보로 직접 다시 요청하세요.</p></div>}
      <p className="subtitle">데이터 기준일: {answer.response.context.asOf} · 생성: {new Date(answer.response.generatedAt).toLocaleString("ko-KR")}{answer.response.cached ? " · 보관된 결과" : ""}</p>
      <h3>상태 요약</h3><p>{result.summary}</p>
      {kind === "diagnosis" ? <DiagnosisCards result={result as DiagnosisResult} safetyUrgent={Boolean(safety && safety.severity >= 2)} /> : <BriefingCards result={result as BriefingResult} context={answer.response.context} />}
      <details><summary>참고한 차량 정보·정비 이력</summary><p>{contextLabel(answer.response.context)}</p><p>미입력 세부 사양은 추정하지 않습니다.</p><ul>{answer.response.context.items.map(item => <li key={item.id}>{item.name}: {item.status === "ok" ? "정상" : item.status === "soon" ? "임박" : "초과"} · 다음 {number(item.nextKm)} km{item.dateDue ? ` · ${item.dateDue}` : ""}</li>)}{answer.response.context.logs.map(log => <li key={log.id}>{log.date} · {log.item} · {number(log.km)} km</li>)}</ul></details>
    </div>}
  </section>;
}
function DiagnosisCards({ result, safetyUrgent }: { result: DiagnosisResult; safetyUrgent: boolean }) {
  return <><p className={safetyUrgent || result.priority === "urgent" ? "error" : "help"}>점검 우선순위: {safetyUrgent || result.priority === "urgent" ? "안전 우선·즉시 점검" : result.priority === "soon" ? "빠른 점검" : "일반 점검"} · 정비소 방문: {safetyUrgent || result.needsWorkshop ? "필요" : "증상 지속 시 필요"}</p><h3>가능한 원인 (가설)</h3>{result.causes.map((cause, i) => <article key={i}><h4>{cause.title}</h4><p>{cause.explanation}</p><p><strong>권장 조치:</strong> {cause.action}</p></article>)}<h3>다음 행동</h3><ul>{result.recommendedActions.map((action, i) => <li key={i}>{action}</li>)}</ul>{result.questions.length > 0 && <><h3>추가 확인 질문</h3><ul>{result.questions.map((question, i) => <li key={i}>{question}</li>)}</ul></>}</>;
}
function BriefingCards({ result, context }: { result: BriefingResult; context: AiContext }) {
  return <><h3>우선 점검 항목</h3>{result.priorities.length ? result.priorities.map((item, index) => <article key={index}><h4>{index + 1}. {context.items.find(i => i.id === item.itemId)?.name}</h4><p>{item.reason}</p><p><strong>다음 행동:</strong> {item.action}</p></article>) : <p>제공된 자료에서 우선 점검 항목이 특정되지 않았습니다.</p>}{result.historyNotes.length > 0 && <><h3>최근 정비 참고 사항</h3>{result.historyNotes.map((note, i) => <p key={i}>{context.logs.find(log => log.id === note.logId)?.item}: {note.note}</p>)}</>}<h3>다음 행동</h3><ul>{result.nextActions.map((action, i) => <li key={i}>{action}</li>)}</ul>{result.missingInformation.length > 0 && <><h3>추가 확인 필요</h3><ul>{result.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></>}</>;
}
