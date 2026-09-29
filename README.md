# Kangwon Limit Hold'em Poker OS

강원랜드 10만 Fixed-Limit Hold'em 개인화 트레이닝 웹앱.

## Current build
- Trainer: v4.2 Field Realism
- Strategy: 10만 Strategy v1.1
- Decision Engine: v2.0 / Full Decision Engine v4.2 lineage
- Canonical / Model / Exploit / Review Only 분리
- Participated-hand result pause
- Field-realistic opponent skill mix and postflop aggression

## GitHub Pages
이 저장소의 `index.html`을 GitHub Pages에서 배포합니다.

GitHub 저장소:
Settings → Pages → Build and deployment → Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

배포 후 주소 예시:
`https://madebyaxis.github.io/poker-os-trainer/`

## Storage
현재 플레이 기록은 브라우저 로컬 저장소(localStorage)를 사용합니다.
따라서 기기/브라우저 간 자동 동기화는 아직 지원하지 않습니다.