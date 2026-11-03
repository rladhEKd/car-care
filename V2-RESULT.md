# CarCare V2 로컬 구현 결과

## 범위와 확인 환경

- 작업 경로: `C:\car-care`
- 참고: `reference/carcare_ai_v2.html` 전체 코드 확인. 참고 HTML은 수정하지 않음.
- 사용자 지정 배포 기준: `main` / `8284823`. 이 작업 폴더에는 `.git`과 Git 실행 파일이 없어 로컬 브랜치·HEAD·diff는 조회할 수 없음. 저장소 초기화·복제·기존 파일 삭제는 하지 않음.
- GitHub push, 원격 브랜치 변경, Vercel 재배포는 하지 않음.

## 구현 결과

1. 정비 예상 견적: 참고 HTML의 고정 예시 8종, 부품비·공임 범위, 단위·수량, 예정 견적 추가·수정·삭제·새로고침 유지. 예정 견적은 실제 비용과 별도 저장. 실제 정비 전환 시 비용을 직접 입력하고 하나의 저장에서 예정 항목 제거 및 실제 이력 추가.
2. 증상 도우미: 실제 AI가 아닌 규칙 기반 안내 명시. 복합 키워드 모두 표시하고 화재·과열 등 높은 위험도 우선. 일치 규칙이 없더라도 안전을 보장하지 않음. 사진은 로컬 미리보기만 제공하고 삭제·파일 검증·객체 URL 해제 처리.
3. 교체 알림: 기존 거리 경계(1,000 km) 유지. 선택적 교체 날짜·개월 주기, 기간 임박 30일, 월말·윤년 보정. 더 시급한 거리·날짜 상태 적용. 이력 편집·삭제·연결 해제 시 기준 복구. 자정 이후·화면 복귀 시 갱신. 앱 내 알림이며 푸시는 제공하지 않음.
4. 저장 호환성: 기존 v1과 v2 모두 읽음. 키와 버전 유지, 새 필드는 선택적 확장. 과거 날짜를 추정하지 않고 원본 데이터는 읽기만 할 때 수정하지 않음. 기존 저장 실패·손상 데이터 보존·오래된 탭 편집 방지 유지.

## 변경 파일

수정:
- `src/lib/carcare.ts`: 선택 필드, 날짜 계산, 하위 호환 파싱
- `src/components/carcare-app.tsx`: 6개 화면 내비게이션과 V2 기능 연결
- `src/components/editor.tsx`: 기간 설정, 실제 비용 입력 및 예정 항목 전환
- `src/components/maintenance-cards.tsx`: 날짜 상태·예정일·알림 이유
- `src/app/globals.css`: V2 화면·모바일 내비게이션·테마 스타일
- `tests/domain.test.mjs`: 기존 8개 및 신규 9개 계산·호환성 테스트
- `README.md`: 사용법·설정·데이터 정책

추가:
- `src/lib/v2.ts`
- `src/lib/use-local-date.ts`
- `src/components/estimates.tsx`
- `src/components/diagnosis.tsx`
- `src/components/reminders.tsx`
- `tests/browser/v2.spec.ts`
- `V2-RESULT.md`

## 검증

- `npx.cmd --no-install tsc --noEmit`: 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과, `/` 정적 사전 렌더링 성공
- `npm.cmd test`: 17개 통과
- `npm.cmd run test:e2e`: 로컬 Chrome 9개 통과(기존 4개, V2 5개)
- 회귀 범위: 기존 차량·소모품·정비 이력 CRUD, 교체 기준 복구, 비용 차트, 저장 유지, 라이트·다크 테마, 예시 데이터 확인·초기화, 저장 실패, v1 변환, 탭 충돌, 손상 데이터 보존
- V2 범위: 기존 v2 무손실 읽기, 견적 CRUD·실제 지출 제외·실제 비용 전환, 날짜 설정과 이력 변경, 자정 갱신, 기간 비활성화, 진단 위험 우선순위·미일치 안내, 사진 검증·미리보기·비저장, 모바일 가로 넘침

## 로컬 확인

`npm.cmd run dev`로 실행 후 터미널의 로컬 주소에서 확인. 소모품 수정에서 기간 교체 주기와 마지막 교체 날짜를 설정하고 대시보드 알림을 확인할 수 있음.

현재 배포 사이트의 localStorage와 localhost의 localStorage는 서로 다른 origin이므로 자동 공유되지 않음. 배포 사이트 데이터에는 이 로컬 작업으로 접근하거나 변경하지 않았음.
