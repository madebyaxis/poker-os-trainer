# Kangwon Limit Hold'em Poker OS

강원랜드 10만 Fixed-Limit Hold'em 개인화 트레이닝 웹앱 (단일 파일 `index.html`).

## Current build (2026-11-13 기준)
- Trainer: **v5.2 Candidate** (2026-11-13 field corrections) — v5.1 Performance + Telemetry 기반
- Decision Engine: v3.0 Candidate / Range Engine v2.1 Dual Public Range
- Solver: Core v0.3 Candidate — 현재 비활성(`SOLVER_ENABLED=false`)
- Strategy: 10만 Strategy v1.1 (Canonical만 채점, Solver·Model·Exploit은 참고 layer)
- Population / Field Model: v0.2 Provisional + `Kangwon Live` 프로필(2026-11-13 관찰, 잠정)

## v5.2 변경점 (2026-11-13)
- **레이크 캡 수정:** 10만 cap 10,000원(잠정) → **20,000원**. 10만·30만 모두 5% / cap 2만(Founder 현장 확인).
- **버그 수정 — 팟 이중 지급:** 핸드가 끝난 뒤 남은 AI 타이머가 이미 폴드한 좌석으로 다시 액션하면서 팟이 두 번 지급되고 칩 회계(`accountingAudit`)가 깨지던 race를 `aiAct`/`act` 가드로 차단. 100핸드 시뮬레이션에서 불법 액션 0건, 회계 diff 0 확인.
- **프리플랍 정본 보강 (Strategy v1.1 + 실전 교정):**
  - `P10-PF13` 앞자리(UTG·UTG+1) 레이즈에 TT~JJ, AQs → Call
  - `P10-PF09` 확장: 앞자리 레이즈에 수딧 커넥터(JTs·T9s 등)·약한 수딧 킹·오프수트 브로드웨이 → Fold
  - `P10-PF14` 림프 팟에서 레이즈 범위 밖 오프수트(KJo·KQo·ATo 등) → Fold. 페어·수딧 오버림프는 기존대로 Review
- **턴 정본 추가:**
  - `P10-T04` 위험요소(멀티웨이·페어드 보드·플러시·스트레이트·벳+레이즈+콜러) 2개 이상 + 플랍 레이저의 턴 연속 벳/턴 레이즈 → 원페어·오버페어·TPTK Fold (공격성이 관찰된 상대는 Review)
  - `P10-T05` 턴에 플러시·스트레이트 완성 + 3명 이상 + 먼저 액션 → 원페어 Check
  - `P10-T06` (비채점 Review) 같은 상황에서 그 수트의 A를 들고 있으면 Bet 제안
- 실시간 채점과 기록 재채점(snapshot regrade)이 같은 턴 규칙(`p10TurnRule`)을 공유.
- 드릴 9개 추가(2026-11-13 실전 핸드: KJo 림퍼 레이즈, JTs·T9s vs EP, KK 2-2-T, AA 플러시 완성 턴 등).
- Field profile `강원랜드 현장(11/13 관찰)` 추가: 레귤러 2 · 니트 1 · 루즈패시브 3 · 콜링스테이션 1 · 루즈어그로 1 비율.

## 테스트
- 브라우저: `tests/run.html` (Pages: https://madebyaxis.github.io/poker-os-trainer/tests/run.html) — 26개 회귀 검사.
- 앱 내부 점검: `PokerOSDebug.runV3SelfTests()`, `PokerOSDebug.accountingAudit()`.

## GitHub Pages
- 공식 주소: https://madebyaxis.github.io/poker-os-trainer/
- `v51.html`은 위 주소로 이동시키는 redirect 전용 페이지입니다.
- 배포: Settings → Pages → Deploy from a branch → `main` / `/ (root)`

## Storage와 백업
- 플레이 기록은 브라우저 `localStorage`에만 저장되며 최근 500핸드까지 보관합니다.
- 서버·Notion으로 자동 전송하지 않습니다. 기기·브라우저 간 동기화도 없습니다.
- 브라우저 데이터를 지우면 기록이 사라집니다. **월 1회 이상 앱의 JSON 내보내기로 백업**하세요.
- 저장 키는 v5.1과 같아서 업데이트 후에도 기존 기록이 유지됩니다.

## 알려진 한계
- 기존 함수를 덮어쓰는 방식의 패치가 여러 겹 있어 로딩 순서에 민감합니다.
- 오버림프(작은 페어·수딧)는 여전히 Review Only입니다. rake cap이 2만으로 확정돼 멀티웨이 큰 팟 부담이 커졌기 때문에 자동 Call 정답으로 올리지 않았습니다.
- `Kangwon Live` 프로필과 턴 T04/T05는 1세션 관찰과 정본 문장에 근거한 Candidate입니다.
- no-flop-no-drop 여부는 미확인이라 프리플랍에서 끝난 팟에도 레이크를 계산합니다.
