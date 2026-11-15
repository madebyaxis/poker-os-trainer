# Kangwon Limit Hold'em Poker OS

강원랜드 10만 Fixed-Limit Hold'em 개인화 트레이닝 웹앱 (단일 파일 `index.html`).

## Current build (2026-11-15 기준)
- Trainer: **v5.3 Candidate** (2026-11-15 강원랜드 현장형) — v5.2 field corrections 기반
- Decision Engine: v3.0 Candidate / Range Engine v2.1 Dual Public Range
- Solver: Core v0.3 Candidate — 현재 비활성(`SOLVER_ENABLED=false`)
- Strategy: 10만 Strategy v1.1 (Canonical만 채점, Solver·Model·Exploit은 참고 layer)
- Population / Field Model: v0.2 Provisional + `Kangwon Live` 프로필(2026-11-13 관찰, 잠정)

## v5.3 변경점 (2026-11-15) · 강원랜드 현장형
- **테이블별 필드 분리:** `강원랜드 10만 현장`(기존 Kangwon Live)과 `강원랜드 30만 현장`(신규). 테이블을 바꾸면 프로필이 자동으로 따라간다. 30만은 레귤러·TAG·LAG·트리키 비중이 높고 실력 분포도 강하다(Founder 서술 기반 잠정값).
- **단골 레귤러:** 10만 2~3명, 30만 3~4명이 이름이 고정된 단골로 앉는다(좌석에 `단골` 표시). 단골의 관찰 기록(VPIP·PFR·공격 빈도)은 세션이 바뀌어도 이어져 판독이 쌓인다. 숨은 성향은 공개하지 않는다. 시험 모드에서는 단골을 앉히지 않는다.
- **30만 공격형 행동:** CO·BTN·SB 스틸, 림퍼 상대 아이소 레이즈, 스틸 상대 라이트 3벳, 헤즈업에서 배럴·블러프 빈도 상향. 10만 로직은 바꾸지 않았다.
- **현장 시계 바:** 핸드 수 ÷ 30핸드/h로 현장 환산 시간, 세션 손익(원·BB), 시간당, 레이크, 콤프(10만 2천/h, 30만 3천/h), 스톱 라인을 테이블 위에 표시한다. 10만은 Founder 확정선(−20만 종료, +25만 검토, +30만 종료, 10시간). 30만은 10만 기준을 BB로 환산한 참고선이다. 선을 넘으면 로그와 힌트로 알린다(훈련은 계속 가능).
- **플레이 리포트(`report.html`):** 누적 플레이 시간별 손익 곡선, 세션 경과 시간대별 시간당 손익, 세션 목록(MDD 포함), KPI(시간당·BB/100·승률·MDD·1,000h 진척), CSV 내보내기. 트레이너 기록은 자동으로 읽고, 실전 기록은 JSON/CSV를 불러와 이 브라우저에만 저장한다(저장소에 올리지 않음).
- **손익 원장:** 핸드별 요약을 `poker_os_pl_ledger_v1`에 따로 쌓아 500핸드 보관 제한과 무관하게 누적 리포트를 만든다. 첫 실행 때 기존 기록에서 채운다.
- 테스트: `tests/run.html` 35개(기존 26 + v5.3 9개). 로컬 시뮬레이션 60핸드×2(10만·30만)에서 회계 불일치 0, 콘솔 오류 0.

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

## 개인 기록 분석 반영 (2026-11-13 export · 97핸드 / 173결정)
- 결과: +23,225원(+4.8bb/100, 표본 작음). 시험 모드 +103,450 / Adaptive −80,225. VPIP 약 32%(목표 18~24%), PFR 13.4%.
- v5.2 기준 재채점 정본 정확도 45/52(86.5%). 미스 7건 중 4건이 레이즈를 맞고 투기 핸드로 콜(T9s·T8s), 림프 팟 KQo 레이즈, KK 턴 연속 액션 콜(−5만).
- 비정본 구간에서 모델 권고와 어긋난 39건 중 가장 많은 유형: 앞 레이즈에 콜(권고 Fold) 10건, 플랍·턴 밸류 벳 대신 체크 10건.
- 반영: Adaptive의 `Raised` 노출 상향(.25→.32), 레이즈 상대 투기 핸드·림프 팟 오프수트 집중 출제, `facing_raise` 드릴 하한 1.8→6.0, 밸류 지속·얇은 밸류·넛 아닌 플러시 콜 드릴 3개 추가.

## 테스트
- 브라우저: `tests/run.html` (Pages: https://madebyaxis.github.io/poker-os-trainer/tests/run.html) — 35개 회귀 검사. `file://`로 열면 iframe 보안 정책 때문에 실행되지 않으니 Pages나 로컬 서버로 연다.
- 앱 내부 점검: `PokerOSDebug.runV3SelfTests()`, `PokerOSDebug.accountingAudit()`.

## GitHub Pages
- 공식 주소: https://madebyaxis.github.io/poker-os-trainer/
- 플레이 리포트: https://madebyaxis.github.io/poker-os-trainer/report.html
- `v51.html`은 위 주소로 이동시키는 redirect 전용 페이지입니다.
- 배포: Settings → Pages → Deploy from a branch → `main` / `/ (root)`

## Storage와 백업
- 플레이 기록은 브라우저 `localStorage`에만 저장되며 최근 500핸드까지 보관합니다.
- 서버·Notion으로 자동 전송하지 않습니다. 기기·브라우저 간 동기화도 없습니다.
- 브라우저 데이터를 지우면 기록이 사라집니다. **월 1회 이상 앱의 JSON 내보내기로 백업**하세요.
- 저장 키는 v5.1과 같아서 업데이트 후에도 기존 기록이 유지됩니다.
- v5.3 추가 키: `poker_os_pl_ledger_v1`(손익 원장, 최대 30,000핸드), `poker_os_regular_memory_v1`(단골 관찰), `poker_os_real_sessions_v1`(불러온 실전 기록), `poker_os_report_prefs_v1`(리포트 설정).

## 알려진 한계
- 현장 환산 시간(30핸드/h)은 미측정 가정이다. 리포트에서 바꿀 수 있다.
- 30만 필드 비율과 공격 레이어 강도는 Founder 서술 기반 잠정값이며 실측 분포가 아니다.
- 기존 함수를 덮어쓰는 방식의 패치가 여러 겹 있어 로딩 순서에 민감합니다.
- 오버림프(작은 페어·수딧)는 여전히 Review Only입니다. rake cap이 2만으로 확정돼 멀티웨이 큰 팟 부담이 커졌기 때문에 자동 Call 정답으로 올리지 않았습니다.
- `Kangwon Live` 프로필과 턴 T04/T05는 1세션 관찰과 정본 문장에 근거한 Candidate입니다.
- no-flop-no-drop 여부는 미확인이라 프리플랍에서 끝난 팟에도 레이크를 계산합니다.
