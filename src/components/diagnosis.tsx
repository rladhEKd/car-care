"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { CircleAlert } from "lucide-react";
import { diagnose } from "@/lib/v2";

const situations = ["항상 발생", "시동 직후", "주행 중", "브레이크 작동 시", "가속할 때", "비가 오거나 추울 때", "간헐적으로 발생"];
export default function Diagnosis() {
  const [symptom, setSymptom] = useState("");
  const [situation, setSituation] = useState(situations[0]);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ symptom: string; situation: string; guide: ReturnType<typeof diagnose> } | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("JPG, PNG, WebP, GIF 이미지 5MB 이하만 선택할 수 있습니다.");
      event.target.value = "";
      return;
    }
    setError(""); setPhoto({ url: URL.createObjectURL(file), name: file.name });
    event.target.value = "";
  }
  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!symptom.trim()) { setError("증상을 공백이 아닌 내용으로 입력해 주세요."); return; }
    setError(""); setResult({ symptom: symptom.trim(), situation, guide: diagnose(symptom) });
  }
  return <section><div className="section-heading"><div><p className="eyebrow">SYMPTOM GUIDE</p><h1>차량 증상 진단 도우미</h1><p className="subtitle">입력 키워드에 따른 점검 안내</p></div><span className="badge soon">규칙 기반</span></div>
    <div className="banner estimate-notice"><strong>실제 AI 진단이 아닙니다</strong><p>미리 정의한 키워드 규칙으로 가능성과 조치를 안내합니다. 고장을 확정하거나 운행 안전을 보증하지 않습니다. 사진은 미리보기만 제공하며 분석·업로드·저장하지 않습니다.</p></div>
    <div className="attention safety-notice"><CircleAlert size={21} /><p>브레이크·조향 이상, 타이어 손상, 연기·화재, 연료 누출, 과열이나 심한 진동이 있으면 결과를 기다리지 말고 안전하게 정차하세요. 위험이 의심되면 운행을 중단하고 긴급출동 또는 견인을 이용하세요.</p></div>
    <div className="card"><form className="feature-form" onSubmit={analyze}><label>어떤 문제가 발생했나요?<textarea value={symptom} onChange={e => { setSymptom(e.target.value); setResult(null); }} rows={4} maxLength={1000} required placeholder="예: 브레이크를 밟으면 쇠 긁는 소리가 나고 핸들도 떨립니다." /></label><label>증상 발생 상황<select value={situation} onChange={e => { setSituation(e.target.value); setResult(null); }}>{situations.map(value => <option key={value}>{value}</option>)}</select></label><p className="help">키워드 판단은 증상 내용만 사용합니다. 발생 상황은 전문가에게 전달할 참고 정보입니다.</p><label className="photo-upload">관련 사진 (선택, 미리보기 전용)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPhoto} /></label>{photo && <div className="photo-preview"><Image src={photo.url} width={640} height={360} unoptimized alt="선택한 증상 관련 사진 미리보기" onError={() => { setPhoto(null); setError("이미지를 열 수 없습니다. 다른 파일을 선택해 주세요."); }} /><p>{photo.name} · 사진은 분석하지 않습니다.</p><button type="button" className="btn sm ghost" onClick={() => setPhoto(null)}>사진 제거</button></div>}{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn ghost" onClick={() => { setSymptom(""); setSituation(situations[0]); setPhoto(null); setResult(null); setError(""); }}>입력 초기화</button><button className="btn" type="submit">규칙 기반 안내 보기</button></div></form></div>
    {result && <section className="card diagnosis-result" aria-label="규칙 기반 안내 결과" aria-live="polite"><div className={`banner ${result.guide.severity >= 2 ? "error" : "estimate-notice"}`}><strong>{result.guide.label}</strong></div><h2>규칙 기반 안내 결과</h2><p className="diagnosis-input">{result.symptom}</p><p className="subtitle">발생 상황: {result.situation} · 사진은 판독하지 않습니다.</p>{result.guide.matches.length ? result.guide.matches.map(rule => <article key={rule.id}><h3>{rule.title}</h3><ul>{rule.possibilities.map(value => <li key={value}>{value}</li>)}</ul><p>{rule.action}</p></article>) : <p className="help">일치하는 규칙이 없습니다. 안전하다는 의미가 아니며, 증상만으로 원인을 확정할 수 없습니다. 증상을 기록해 정비소에서 재현 점검과 진단기 확인을 받으세요.</p>}<p className="help">모든 결과는 규칙 기반 참고 안내입니다. 실제 AI 진단·고장 확정·운행 안전 보증이 아니며 전문가 점검을 우선하세요.</p></section>}
  </section>;
}
