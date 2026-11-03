import type { EstimatePlan } from "./carcare";

// Static examples from reference/carcare_ai_v2.html; these are not live market quotations.
export const estimateCatalog = [
  { item: "엔진오일", partMin: 35000, partMax: 90000, laborMin: 15000, laborMax: 35000, unit: "1회", memo: "오일 규격·용량·필터 종류에 따라 차이" },
  { item: "타이어", partMin: 70000, partMax: 220000, laborMin: 10000, laborMax: 25000, unit: "1개", memo: "휠 크기·브랜드·런플랫 여부에 따라 차이" },
  { item: "브레이크 패드", partMin: 40000, partMax: 120000, laborMin: 30000, laborMax: 60000, unit: "1축", memo: "전륜/후륜 및 차종에 따라 차이" },
  { item: "브레이크액", partMin: 15000, partMax: 35000, laborMin: 30000, laborMax: 60000, unit: "1회", memo: "액 규격 및 교환 방식에 따라 차이" },
  { item: "에어컨 필터", partMin: 10000, partMax: 35000, laborMin: 0, laborMax: 15000, unit: "1개", memo: "자가 교체 가능 차종은 공임이 없을 수 있음" },
  { item: "배터리", partMin: 90000, partMax: 220000, laborMin: 10000, laborMax: 30000, unit: "1개", memo: "AGM/EFB/일반 배터리 및 용량에 따라 차이" },
  { item: "미션오일", partMin: 70000, partMax: 180000, laborMin: 50000, laborMax: 120000, unit: "1회", memo: "순환식/드레인 방식과 오일량에 따라 차이" },
  { item: "점화플러그", partMin: 30000, partMax: 120000, laborMin: 30000, laborMax: 100000, unit: "1세트", memo: "실린더 수와 플러그 재질에 따라 차이" },
];
export function estimateRange(plan: Pick<EstimatePlan, "partMin" | "partMax" | "laborMin" | "laborMax" | "quantity">) {
  return { min: (plan.partMin + plan.laborMin) * plan.quantity, max: (plan.partMax + plan.laborMax) * plan.quantity };
}
type Rule = { id: string; title: string; severity: number; pattern: RegExp; possibilities: string[]; action: string };
const rules: Rule[] = [
  { id: "power", title: "심각한 출력·진동 이상", severity: 2, pattern: /심(한|각한|하게|각하게).*?(출력|떨림|진동)|갑자기.*(출력|가속).*(안|저하)|출력.*급격|출력\s*이상|가속.*불가/, possibilities: ["엔진·구동 계통 이상 등 원인 점검 필요"], action: "안전한 장소에 정차하고 운행을 중단하세요. 급격한 출력 저하나 심한 진동은 긴급출동 또는 견인 점검을 받으세요." },
  { id: "fire", title: "화재·누출 위험", severity: 3, pattern: /연기|불꽃|화재|타는\s*냄새|휘발유\s*냄새|연료\s*누출|기름\s*냄새/, possibilities: ["전기 계통 과열 또는 오일·연료 누출 가능성"], action: "안전하게 정차하고 시동을 끈 뒤 차량에서 떨어지세요. 화재·연료 누출이 의심되면 긴급 도움을 요청하고 운행을 재개하지 마세요." },
  { id: "heat", title: "엔진 과열 위험", severity: 3, pattern: /과열|수온|냉각수.*(누|새|끓)|온도.*(빨|높)/, possibilities: ["냉각수 부족·누출 또는 냉각 계통 이상 가능성"], action: "안전하게 정차하고 엔진을 끄세요. 뜨거운 냉각수 캡을 열지 말고 긴급출동 또는 견인을 요청하세요." },
  { id: "brake", title: "제동 계통 점검", severity: 2, pattern: /브레이크|제동|쇠.*소리|긁는\s*소리/, possibilities: ["브레이크 패드 마모·디스크 손상 또는 캘리퍼 이상 가능성"], action: "안전한 곳에 정차하고 운행을 중단한 뒤 견인 또는 전문가 점검을 받으세요." },
  { id: "steering", title: "조향·진동 점검", severity: 2, pattern: /핸들|조향|심한\s*(진동|떨림)|차체.*떨/, possibilities: ["조향·서스펜션·휠 계통 이상 가능성"], action: "조작이 어렵거나 심하게 떨리면 안전하게 정차하고 견인 점검을 받으세요." },
  { id: "tire", title: "타이어 점검", severity: 2, pattern: /타이어|펑크|공기압|바람\s*빠/, possibilities: ["타이어 손상·펑크 또는 공기압 저하 가능성"], action: "옆면 손상·혹·심한 공기압 저하가 있으면 주행하지 마세요. 안전한 장소에서 긴급출동 또는 전문점 점검을 받으세요." },
  { id: "engine", title: "엔진·시동 점검", severity: 1, pattern: /엔진\s*경고등|체크\s*엔진|출력\s*저하|시동.*(안|불가|꺼)|경고등.*깜빡/, possibilities: ["센서·점화·연료·배출가스 계통 등 다양한 원인 가능"], action: "고장 코드 스캔과 정비소 점검을 받으세요. 경고등 점멸·심한 떨림·출력 저하가 동반되면 운행을 중단하세요." },
  { id: "climate", title: "냉·난방 점검", severity: 0, pattern: /에어컨|냉방|히터|송풍/, possibilities: ["필터 오염·냉매 부족 또는 컴프레서·송풍 계통 문제 가능성"], action: "바람 세기와 냉·난방 상태를 기록해 정비소에서 점검받으세요." },
];
export function diagnose(symptom: string) {
  const matches = rules.filter(rule => rule.pattern.test(symptom.toLowerCase())).sort((a, b) => b.severity - a.severity);
  const severity = matches[0]?.severity ?? 0;
  return { severity, label: severity === 3 ? "즉시 안전 조치" : severity === 2 ? "안전 우선 · 운행 중단 권장" : severity === 1 ? "빠른 점검 권장" : "전문가 점검 안내", matches };
}
