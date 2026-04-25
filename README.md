# demo01-front

TimeBox Planner MVP 데모 저장소입니다.

## 구성
- `index.html`, `styles.css`, `app.js`: 프론트엔드(웹 로그인 게이트 + 로컬 모드 + 계획/양식/기록 UI)
- `server.js`: PRD API 형태를 반영한 Node.js mock backend
- `PRD.md`: 제품 요구사항 요약
- `AGENT.md`: 구현 방향성(북극성) 문서

## 실행

### 1) 프론트 실행
```bash
npm run start:web
```
브라우저에서 `http://localhost:4173` 접속

### 2) 백엔드 실행
```bash
npm run start:api
```
기본 포트 `8787`

### 3) 문법 점검
```bash
npm run check
```
