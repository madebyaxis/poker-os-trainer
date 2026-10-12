# Kangwon Limit Hold'em Poker OS

강원랜드 10만 Fixed-Limit Hold'em 개인화 트레이닝 웹앱 (단일 파일 `index.html`).

## Current build (2026-10-12 기준)
- Trainer: v5.1 Candidate (Performance + Telemetry)
- Decision Engine: v3.0 Candidate / Range Engine v2.1 Dual Public Range
- Solver: Core v0.3 Candidate — HU Turn/River 조건부 CFR (River 실시간, Turn은 복기 경로)
- Strategy: 10만 Strategy v1.1 (Canonical만 채점, Solver·Model·Exploit은 참고 layer)
- Population / Field Model: v0.2 Provisional

> Candidate 단계입니다. Solver 결과는 정본 정답이 아니며 실전 수익성(bb100) 지표로 쓰지 않습니다.

## GitHub Pages
- 공식 주소: https://madebyaxis.github.io/poker-os-trainer/
- `v51.html`은 위 주소로 이동시키는 redirect 전용 페이지입니다.
- 배포: Settings → Pages → Deploy from a branch → `main` / `/ (root)`
- 기준 브랜치: `main`. `v5.1-candidate`는 동일 내용의 미러입니다(v51.html 유무만 다름).

## Storage와 백업
- 플레이 기록은 브라우저 `localStorage`에만 저장되며 최근 500핸드까지 보관합니다.
- 서버·Notion으로 자동 전송하지 않습니다. 기기·브라우저 간 동기화도 없습니다.
- 브라우저 데이터를 지우면 기록이 사라집니다. **월 1회 이상 앱의 JSON 내보내기로 백업**하세요.
- 내보내기 JSON에는 `schemaVersion`(`poker-os-export-v1-…`)이 들어 있고, 가져오기는 중복을 병합합니다.

## 알려진 한계
- 기존 함수를 덮어쓰는 방식의 패치가 여러 겹 있어 로딩 순서에 민감합니다.
- 저장소에는 회귀 테스트가 아직 없습니다. 상세는 `tests/README.md`를 참고하세요.
- 실제 강원랜드 rake와 현장 통계 보정은 미완료입니다.
