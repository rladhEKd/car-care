"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowRight, BarChart3, Calculator, CarFront, CircleAlert, ClipboardList, Database, Gauge, House, Monitor, Moon, Pencil, Plus, RotateCcw, ShieldCheck, Stethoscope, Sun, Wrench } from "lucide-react";
import { costSummary, deleteItem, emptyData, money, number, sampleData, sortedLogs, stateRank, status, type Data } from "@/lib/carcare";
import { useLocalDate } from "@/lib/use-local-date";
import { commit, useCarCare } from "@/lib/storage";
import Editor, { Modal, type EditorMode } from "./editor";
import { Badge, ItemCard, LogList } from "./maintenance-cards";
import Reminders from "./reminders";
import Estimates from "./estimates";
import Diagnosis from "./diagnosis";

const CostAnalysis = dynamic(() => import("./cost-analysis"), { loading: () => <div className="card empty">차트를 불러오는 중입니다…</div>, ssr: false });
const tabs = [ { id: "dash", label: "대시보드", icon: House }, { id: "items", label: "소모품", icon: Wrench }, { id: "logs", label: "정비 이력", icon: ClipboardList }, { id: "cost", label: "비용 분석", icon: BarChart3 }, { id: "estimate", label: "정비 견적", icon: Calculator }, { id: "diagnosis", label: "증상 진단", icon: Stethoscope } ] as const;
type Tab = typeof tabs[number]["id"];
type Confirmation = { title: string; message: string; action: () => void };

export default function CarCareApp() {
  const snapshot = useCarCare();
  const currentDate = useLocalDate();
  const [tab, setTab] = useState<Tab>("dash");
  const [editor, setEditor] = useState<{ mode: EditorMode; data: Data } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const data = snapshot?.data;
  function navigate(next: Tab) { setTab(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function edit(mode: EditorMode) { if (data) { setError(""); setEditor({ mode, data }); } }
  function persist(next: Data, recover = false) { commit(next, recover, data); setError(""); setNotice("변경 사항을 저장했습니다."); }
  function destructive(title: string, message: string, action: () => void) { setConfirmation({ title, message, action }); }
  function loadSample() {
    if (!data) return;
    const action = () => { persist({ ...sampleData(), theme: data.theme }); setTab("dash"); };
    if (data.car || data.items.length || data.logs.length) destructive("예시 데이터 불러오기", "현재 차량, 소모품, 정비 이력과 예정 견적을 예시 데이터로 덮어씁니다. 계속할까요?", action);
    else { try { action(); } catch (e) { setError((e as Error).message); } }
  }
  function reset() {
    destructive("전체 초기화", "이 웹앱의 차량·소모품·정비 이력과 예정 견적을 모두 초기화합니다. 이 작업은 되돌릴 수 없습니다. 기존 HTML의 원본 데이터는 별도 보존됩니다.", () => { persist({ ...emptyData(), theme: data?.theme ?? "auto" }, Boolean(snapshot?.error)); setTab("dash"); });
  }
  const ordered = data ? sortedLogs(data.logs) : [];
  const summary = data ? costSummary(data.logs) : null;
  const itemIds = data?.items.map(i => i.id) ?? [];
  const ranked = data?.car ? [...data.items].sort((a, b) => { const sa = status(a, data.logs, data.car!.km, currentDate), sb = status(b, data.logs, data.car!.km, currentDate); return stateRank[sb.code] - stateRank[sa.code] || (sa.daysLeft ?? Infinity) - (sb.daysLeft ?? Infinity) || sa.remaining - sb.remaining; }) : [];
  const urgent = ranked.filter(i => status(i, data!.logs, data!.car!.km, currentDate).code !== "ok");
  return <div className="carcare-app" data-theme={data?.theme ?? "auto"}>
    <a href="#main" className="skip-link">본문으로 건너뛰기</a>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => navigate("dash")} aria-label="CarCare 대시보드"><CarFront size={27} strokeWidth={2.2} /><span>Car<b>Care</b><small>나의 차량 관리 파트너</small></span></button><nav aria-label="주요 메뉴">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={16} />{label}</button>)}</nav><label className="theme-control"><span className="sr-only">화면 테마</span>{data?.theme === "dark" ? <Moon size={17} /> : data?.theme === "light" ? <Sun size={17} /> : <Monitor size={17} />}<select aria-label="화면 테마" value={data?.theme ?? "auto"} disabled={!data || Boolean(snapshot?.error)} onChange={e => { try { persist({ ...data!, theme: e.target.value as Data["theme"] }); } catch (e) { setError((e as Error).message); } }}><option value="auto">자동</option><option value="light">라이트</option><option value="dark">다크</option></select></label></div></header>
    <main id="main" className="main-container">
      {!snapshot ? <div className="card empty" role="status">저장된 차량 정보를 불러오는 중입니다…</div> : <>
        {(error || snapshot.error) && <div className="banner error" role="alert"><CircleAlert size={19} /><span>{error || snapshot.error}</span>{snapshot.error && <button className="btn sm danger" onClick={reset}>전체 초기화</button>}</div>}
        {notice && !error && <div className="save-notice" role="status"><ShieldCheck size={14} />{notice}</div>}
        {snapshot.legacy && <div className="banner info">기존 HTML 데이터를 불러왔습니다. 첫 저장 시 새 형식으로 저장하며 원본(carcare.v1)은 보존합니다. 교체 기준은 연결된 정비 이력을 함께 반영합니다.</div>}
        {data && !snapshot.error && <>
          {!data.car ? <section className="card welcome"><div className="welcome-icon"><CarFront size={48} /></div><p className="eyebrow">WELCOME TO CARCARE</p><h1>내 차를 아끼는 가장 쉬운 방법</h1><p>소모품 교체 시기부터 정비 비용까지,<br />CarCare에서 한눈에 관리하세요.</p><div className="welcome-actions"><button className="btn" onClick={() => edit({ kind: "car" })}><Plus size={17} />차량 등록하기</button><button className="btn ghost" onClick={loadSample}>예시 데이터로 시작<ArrowRight size={16} /></button></div><div className="welcome-features"><span><Gauge size={17} />주행거리 관리</span><span><Wrench size={17} />교체 시기 확인</span><span><BarChart3 size={17} />정비 비용 분석</span></div></section> : <>
            {tab === "dash" && <>
              <div className="section-heading"><div><p className="eyebrow">MY CAR OVERVIEW</p><h1>내 차, 오늘의 상태</h1><p className="subtitle">작은 점검이 더 오래, 더 안전한 운전을 만듭니다.</p></div><span className="local-tag"><ShieldCheck size={14} />내 브라우저에 저장</span></div>
              <section className="hero card" aria-label="차량 정보"><div className="hero-car"><div className="hero-icon"><CarFront size={42} /></div><div><small>{data.car.year}년식 · MY CAR</small><h2>{data.car.name}</h2><button className="hero-edit" onClick={() => edit({ kind: "car" })}><Pencil size={12} />차량 정보 수정</button></div></div><div className="hero-stats"><div><span>현재 주행거리</span><strong>{number(data.car.km)}<small> km</small></strong><button className="hero-edit" onClick={() => edit({ kind: "car" })}>주행거리 업데이트 <ArrowRight size={12} /></button></div><div><span>누적 정비 비용</span><strong>{money(summary!.total)}</strong><span>{data.logs.length}건의 정비 기록</span></div></div></section>
              <div className="summary-grid status-summary">{(["ok", "soon", "over"] as const).map(code => <button className="card" key={code} onClick={() => navigate("items")}><div className={`summary-icon ${code}`}><Wrench size={20} /></div><div><span>{code === "ok" ? "정상" : code === "soon" ? "교체 임박" : "교체 초과"}</span><strong className={`text-${code}`}>{data.items.filter(i => status(i, data.logs, data.car!.km).code === code).length}<small>개 항목</small></strong></div><ArrowRight className="summary-arrow" size={17} /></button>)}</div>
              {urgent.length > 0 && <div className="attention"><CircleAlert size={20} /><div><strong>점검이 필요한 소모품이 {urgent.length}개 있어요</strong><p>{urgent.map(i => i.name).join(", ")} · 교체 시기를 확인해 주세요.</p></div><button className="btn sm ghost" onClick={() => navigate("items")}>확인하기</button></div>}
              <Reminders data={data} currentDate={currentDate} onManage={() => navigate("items")} />
              <div className="section-title"><h2>다음 교체 예정 항목</h2><button className="text-button" onClick={() => navigate("items")}>전체 보기<ArrowRight size={15} /></button></div><div className="item-grid">{ranked.slice(0, 3).map(item => <ItemCard key={item.id} item={item} logs={data.logs} km={data.car!.km} />)}</div>{!ranked.length && <div className="card empty">등록된 소모품이 없습니다.</div>}
              <div className="dashboard-bottom"><section><div className="section-title"><h2>소모품별 관리 상태</h2></div><div className="card compact-list">{ranked.map(item => <div className="status-row" key={item.id}><span aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>다음 {number(status(item, data.logs, data.car!.km).next)} km</small></div><Badge state={status(item, data.logs, data.car!.km)} /></div>)}{!ranked.length && <div className="empty">소모품을 등록해 주세요.</div>}</div></section><section><div className="section-title"><h2>최근 정비 이력</h2><button className="text-button" onClick={() => navigate("logs")}>전체 보기<ArrowRight size={15} /></button></div><div className="card compact-list"><LogList logs={ordered.slice(0, 5)} itemIds={itemIds} /></div></section></div>
            </>}
            {tab === "items" && <section><div className="section-heading"><div><p className="eyebrow">MAINTENANCE</p><h1>소모품 관리</h1><p className="subtitle">교체 시기를 놓치지 않도록, 꼼꼼하게.</p></div><button className="btn" onClick={() => edit({ kind: "item" })}><Plus size={17} />소모품 추가</button></div><div className="info-strip">현재 {number(data.car.km)} km · 정상: 1,000 km 초과 / 임박: 0~1,000 km 남음 / 초과: 교체 예정 거리 경과</div><div className="item-grid">{data.items.map(item => <ItemCard key={item.id} item={item} logs={data.logs} km={data.car!.km} onDone={() => edit({ kind: "log", itemId: item.id })} onEdit={() => edit({ kind: "item", id: item.id })} onDelete={() => destructive("소모품 삭제", `${item.name} 소모품을 삭제할까요? 정비 이력과 비용은 유지되고 해당 소모품 연결만 해제됩니다.`, () => persist(deleteItem(data, item.id)))} />)}</div>{!data.items.length && <div className="card empty">소모품을 추가해 주세요.</div>}</section>}
            {tab === "logs" && <section><div className="section-heading"><div><p className="eyebrow">SERVICE HISTORY</p><h1>정비 이력</h1><p className="subtitle">내 차를 위한 관리의 기록 · 날짜 최신순</p></div><button className="btn" onClick={() => edit({ kind: "log" })}><Plus size={17} />이력 등록</button></div><div className="card"><LogList logs={ordered} itemIds={itemIds} onEdit={id => edit({ kind: "log", id })} onDelete={id => destructive("정비 이력 삭제", "이 기록을 삭제할까요? 비용 합계와 연결된 소모품 교체 기준이 자동으로 다시 계산됩니다. 차량의 현재 주행거리는 유지됩니다.", () => persist({ ...data, logs: data.logs.filter(l => l.id !== id) }))} /></div></section>}
            {tab === "cost" && <CostAnalysis logs={data.logs} />}
            {tab === "estimate" && <Estimates data={data} onSave={persist} onComplete={id => edit({ kind: "log", estimateId: id })} />}
            {tab === "diagnosis" && <Diagnosis />}
          </>}
          <aside className="disclaimer"><CircleAlert size={18} /><div><strong>교체 주기는 예시 값입니다</strong><p>표시된 주기는 제조사의 공식 기준이 아닙니다. 차량 사용 설명서와 운행 조건에 맞춰 조정하고 정비 전문가와 상담하세요. 브레이크액 등은 경과 기간 점검도 필요합니다. 기간 알림은 개월 수와 교체 날짜가 설정된 항목에 적용하며, 30일 이내를 임박으로 표시합니다. 거리·날짜 중 더 시급한 상태를 표시합니다.</p></div></aside>
          <footer className="page-footer"><p>CarCare <span>· 내 차를 위한 작은 습관</span></p><div><button className="text-button" onClick={loadSample}><Database size={14} />예시 데이터 불러오기</button><button className="text-button destructive" onClick={reset}><RotateCcw size={14} />전체 초기화</button></div></footer>
        </>}
      </>}
    </main>
    {editor && <Editor mode={editor.mode} data={editor.data} onClose={() => setEditor(null)} onSave={next => { if (snapshot?.data !== editor.data) throw new Error("편집 중 데이터가 변경되었습니다. 창을 닫고 최신 내용으로 다시 편집해 주세요."); persist(next); setEditor(null); }} />}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p className="confirm-message">{confirmation.message}</p><div className="modal-actions"><button className="btn ghost" onClick={() => setConfirmation(null)}>취소</button><button className="btn" onClick={() => { try { confirmation.action(); setConfirmation(null); } catch (e) { setError((e as Error).message); setConfirmation(null); } }}>확인</button></div></Modal>}
  </div>;
}
