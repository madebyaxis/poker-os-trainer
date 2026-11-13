# Tests

## 회귀 테스트 (2026-11-13 추가)
- `regression.js`: 순수 함수(`snapshotCanonicalRecommendation`, `p10TurnRule`, `CANON`, `RAKE_CAP`, `runV3SelfTests`)만 호출하는 26개 검사. 기록·세션을 바꾸지 않습니다.
- `run.html`: 앱을 숨은 iframe으로 불러와 `regression.js`를 실행하고 결과를 보여줍니다. GitHub Pages에서 폰으로도 열 수 있습니다.
- 개발 시 시뮬레이션(로컬): 히어로가 추천대로 100핸드를 진행하며 `accountingAudit()` diff 0과 불법 액션 0건을 확인했습니다(v5.2 기준).

## 보존이 필요한 원본 (미확보)
운영 리포트(2026-10-01)에 기록된 아래 자료의 원본이 저장소·Drive(`08_POKER OS`)에서 확인되지 않았습니다.
- v5.0 regression 439건
- 30,000-hand integrity 테스트
- 과거 Astra 170 regression, 97,344 Preflop coverage 원본

원본을 찾으면 이 폴더에 넣고, 실행 방법을 이 문서에 적습니다. 신규 회귀 PASS를 과거 coverage의 대체 증거로 보지 않습니다.
