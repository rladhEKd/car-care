# CarCare V3 로컬 구현·검증 결과

기존 V2를 확장했습니다. GitHub push, Vercel 배포, 프로덕션 환경변수 변경은 하지 않았습니다. 로컬에는 `.git`과 Git 실행 파일이 없어 HEAD/브랜치는 조회하지 못했으며, 프로젝트를 초기화하지 않았습니다.

## 1. 변경 파일

추가:
- `src/app/api/ai/diagnosis/route.ts`, `briefing/route.ts`, `status/route.ts`: AI POST 2개와 설정 상태 GET
- `src/lib/ai/contracts.ts`: 요청·응답 Zod 스키마와 타입
- `src/lib/ai/context.ts`: 데이터 선별과 기존 교체 상태 전달
- `src/lib/ai/prompts.ts`: 별도 시스템 지침
- `src/lib/ai/provider.ts`: 공식 SDK 서버 호출
- `src/lib/ai/service.ts`: 입력 검증·요청 보호·응답 검증·오류 처리
- `src/components/ai-assistant.tsx`: 상담·브리핑 UI, 임시 캐시, 복사, 오래된 결과 표시
- `tests/ai/service.test.ts`, `tests/ai/provider.test.ts`, `tests/browser/ai.spec.ts`
- `.env.example`, `V3-RESULT.md`

수정:
- `src/components/diagnosis.tsx`: 기존 폼·사진 미리보기·규칙 결과 유지, 즉시 안전 경고와 AI 상담 추가
- `src/components/carcare-app.tsx`: AI 브리핑, 미등록 차량의 일반 증상 안내, 초기화 시 AI 메모리 정리
- `src/lib/v2.ts`: 기존 안전 규칙 유지 및 심각한 출력 이상 규칙 보강
- `src/app/globals.css`: AI 카드·상태·모바일 스타일
- `.gitignore`: 실제 env 파일 제외, 빈 `.env.example`만 허용
- `package.json`, `package-lock.json`: 의존성·테스트 명령
- `README.md`: V3 문서 연결

## 2. 구현한 AI 기능

증상 상담은 증상 1~1,000자와 선택적 상황 최대 100자를 받습니다. 버튼을 눌러야 서버를 호출하며 관련 소모품·이력만 선별합니다. 차량명·연식·주행거리 외의 상세 사양은 추정하지 않습니다. 메모·비용·예정 견적·사진은 전송하지 않습니다. 관련 규칙이 없으면 전체 이력을 대신 보내지 않습니다.

결과는 요약, 우선순위, 원인 가설 최대 3개와 설명·조치, 방문 필요 여부, 참고 데이터, 질문 최대 2개입니다. 차량·이력이 없어도 일반 상담을 지원합니다. 사진은 V2 미리보기 전용입니다. 제동·조향·타이어·화재·누출·과열·심한 진동·출력 이상 경고는 입력 즉시 규칙으로 표시합니다. 서버에서도 위험도를 확인해 AI가 낮게 평가하더라도 우선순위와 방문 필요 여부를 상향합니다. API가 없어도 V2 안내는 동작합니다.

브리핑은 대시보드의 버튼으로만 실행하며 차량 등록이 필요합니다. 앱이 계산한 교체 기준·예정 거리·날짜·상태를 전달하고 Gemini가 재계산하도록 하지 않습니다. 우선 점검 최대 3개, 이력 참고 사항, 다음 행동, 부족한 정보를 표시합니다. 당시 기준일·생성 시각·자료를 보여주고 차량·소모품·이력·날짜 변경 시 오래된 결과로 표시합니다.

두 기능 모두 로딩·직접 재시도·복사·오류 안내를 제공합니다. 결과는 탭 메모리에 최대 5개, 10분간만 보관하며 동일 입력은 재사용합니다. 새로고침·렌더링·화면 진입 시 Gemini를 자동 호출하지 않습니다. 설정 확인용 `/api/ai/status`는 Google을 호출하지 않습니다. AI 결과는 HTML 삽입이나 실제 정비 기록 자동 등록에 사용하지 않습니다.

## 3. 모델과 무료 티어 확인

2026-11-03 공식 자료 확인:
- [Google 가격표](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash): Standard Free Tier의 텍스트 입력·출력 무료 표시
- [Gemini 3.8 Flash 사양](https://aistudio.google.com/docs/models/gemini-3.8-flash): 안정 ID `gemini-3.8-flash`, 텍스트 입출력·구조화 출력 지원
- [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/), [HTTP 옵션](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html)

선택 모델은 `gemini-3.8-flash`입니다. 서버 `GEMINI_MODEL`로 관리하며 현재 허용 목록은 확인한 이 모델 1개입니다. 다른 모델은 공식 무료 지원을 재확인하고 허용 목록도 수정해야 합니다. 유료 모델 자동 전환·검색·도구·이미지 분석은 없습니다. 한국어 지침을 적용했으나 실제 한국어 품질과 계정별 접근 가능 여부는 아직 실측하지 않았습니다.

설치: `@google/genai@2.32.0`, `zod@4.6.7`, `server-only@0.0.1`, 테스트용 `tsx@4.23.15`.

## 4. API 키 설정

`.env.example`을 `.env.local`로 복사하고 서버 전용 값만 설정하세요. 실제 키는 채팅·코드·문서·커밋에 넣지 마세요.

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FREE_TIER_CONFIRMED=false
```

사용자가 AI Studio에서 프로젝트 Free Tier·모델 할당량·결제 미활성 상태를 확인한 다음 키를 입력하고 `GEMINI_FREE_TIER_CONFIRMED=true`로 바꾸고 서버를 재시작합니다. 이 플래그는 운영자의 확인 표시이며 과금 상태를 Google API로 검증하지 않습니다. 결제 활성화는 필요하지 않습니다. 미설정·미허용 모델·무료 확인 누락이면 AI만 비활성화됩니다. 실제 `.env.local`은 만들거나 수정하지 않았습니다.

## 5. 테스트 결과

**실제 키가 없어 Gemini 실호출 성공은 검증하지 않았습니다.** SDK는 가짜 HTTP, AI UI의 성공은 모의 응답으로 테스트했습니다. 테스트용 문자열은 실제 키가 아닙니다.

- TypeScript·ESLint·프로덕션 빌드 통과. `/` 정적 렌더링 및 AI Route Handler 3개 생성
- 도메인 계산 테스트 17개
- AI 서버·공식 SDK 모의 테스트 16개
- Chrome 통합 테스트 13개(기존 9개, AI 4개)

서버 테스트: 정상·차량 없음·이력 없음, 위험도 하한, 빈 입력·길이·잘못된 계산·Origin·JSON·본문 크기, 키 누락, SDK 실패·429·타임아웃·중단 신호, 잘못된 JSON 응답·누락 필드·허용되지 않는 위험도·긴 응답·없는 기록 ID·키·임의 확률 차단, 캐시·중복 진행·쿨다운·일일 상한, 개인정보 최소화, SDK JSON 설정과 자동 재시도 금지.

브라우저 테스트: 명시적 실행·중복 클릭, 복사·재사용·오래된 결과, 실패 시 규칙 경고 유지, 데이터 최소화, 미등록 차량·빈 입력·모바일. 실제 로컬 Route Handler의 입력 오류 400과 미설정 503도 확인합니다. 클라이언트 빌드에 Google SDK 및 테스트 키가 없는지 검색했습니다.

명령:
```powershell
npm.cmd run lint
npx.cmd --no-install tsc --noEmit
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

이 제한된 Windows 환경에서는 tsx 사용자 정보 조회와 Playwright 서버 정리를 위해 실행 권한 조정이 필요했습니다.

## 6. V2·데이터 호환성

`src/lib/storage.ts`와 `src/lib/carcare.ts`의 저장 구조·거리/날짜 기준·지출 계산은 수정하지 않았습니다. `carcare.v1`, `carcare.v2`, 날짜·예정 견적 필드를 모두 유지합니다. AI용 localStorage 키도 만들지 않았습니다. AI는 실제 지출·주행거리·교체 기준·정비 이력·견적에 쓰지 않습니다.

기존 차량·소모품·이력 CRUD, 수정·삭제 후 기준 복구, 월말·윤년·날짜 알림, 견적 CRUD·실제 전환·지출 분리, 차트·테마, 저장 실패·손상 데이터 보존·탭 충돌을 회귀 테스트합니다.

## 7. 알려진 한계와 보안 위험

- 코드만으로 무료 한도·과금 방지를 보장할 수 없습니다. AI Studio의 Free Tier·결제·쿼터는 사용자 확인이 필요합니다.
- 인증 없는 공개 API입니다. Origin·Host 검사와 JSON 제한은 직접 HTTP·분산 요청까지 인증하지 못합니다.
- 보호 한도는 IP 해시별 20초 간격·10분당 4회, 동시 최대 2회, 인스턴스별 UTC 일일 최대 20회입니다. 실패도 횟수에 포함합니다. 클라이언트는 기본 20초 및 429 안내 대기 후 직접 재시도합니다.
- Vercel 다중 인스턴스·리전·콜드 스타트에서는 메모리 제한이 공유되지 않습니다. IP도 위조·공유될 수 있어 인증/공유 저장소 없이 전역 제한은 보장하지 않습니다.
- SDK `attempts: 1`, 서버 20초·클라이언트 25초·플랫폼 최대 30초입니다. 중단은 로컬 대기 중단이며 이미 Google에 전달된 요청의 처리·쿼터 사용 취소까지 보장하지 않습니다.
- 서버 캐시는 IP·모델·입력 해시 기준 최대 20개, 10분입니다. 원문 IP·증상 전문·키·원본 SDK 오류를 로그에 기록하지 않습니다.
- Free Tier 입력·출력은 Google 서비스 개선에 사용될 수 있어 UI에 고지합니다. 사용자 작성 증상·차량명에 직접 들어간 개인정보를 완벽히 제거하지는 못합니다.
- 스키마·길이·열거형·참조 ID·키·퍼센트 검증도 모든 자연어 환각과 프롬프트 주입을 완벽히 막지는 못합니다. 전문가의 실제 점검이 우선입니다.
- 실제 API 연결·할당량·한국어 응답 품질 확인이 남아 있습니다. 기존 npm 의존성의 보통 등급 취약점 16건도 남아 있습니다.

## 8. Vercel 배포 방법 (이번에는 실행하지 않음)

사용자 확인 후 기존 GitHub `main`에 소스를 올리고 기존 Vercel `car-care` 프로젝트를 사용합니다. 새 프로젝트를 만들지 않습니다. 연결 정보는 `.vercel/project.json`에 있습니다.

기존 프로젝트 Settings → Environment Variables → Production에서 `GEMINI_API_KEY`는 Secret, `GEMINI_MODEL`은 위 모델, 무료 설정을 확인한 뒤 `GEMINI_FREE_TIER_CONFIRMED=true`를 등록합니다. 새 소스로 재배포해야 반영됩니다. 변수가 없어도 V2는 작동합니다.

이 프로젝트는 기존에 소스 직접 업로드로 배포했고 GitHub 자동 연동은 별도 설치가 필요합니다. CLI를 사용할 경우 기존 팀·프로젝트 연결을 확인한 후 `npx.cmd vercel deploy --prod`로 배포할 수 있습니다. 배포 후 READY·실제 AI 응답·쿼터 오류·클라이언트 키 비노출을 확인해야 합니다.
