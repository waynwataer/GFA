# GFA Haverhill Dashboard · 자비스(Jarvis) v6

## 이번 업그레이드에서 바뀐 것

### 1. AI를 자비스(GPT) 하나로 단순화 [중요]
이전 버전은 GPT·Gemini·Groq 3개 버튼과 "3AI 비교" 모드가 있었는데, 어느 버튼을
눌러 나온 답인지 헷갈린다는 피드백을 받았습니다. **Gemini와 Groq를 완전히
제거**하고 **자비스(GPT) 하나만** 남겼습니다.
- 프론트엔드: 모드 선택 버튼 자체가 사라지고 "🤖 자비스" 라벨만 남습니다.
- 백엔드(`api/ai-compare.js`): Gemini/Groq 호출 코드, 3AI 비교, 종합판정
  로직을 전부 제거하고 OpenAI 호출 하나로 단순화했습니다.
- `api/health.js`도 `openai/gemini/groq` 3개 플래그 대신 `jarvis` 플래그
  하나만 반환합니다.
- Google Apps Script 로거(`google_apps_script_chat_log.gs`)도 시트 컬럼을
  `GPT | Gemini | Groq | 종합판정` 4개에서 `자비스 응답` 하나로 정리했습니다.
  **기존에 이 스크립트를 이미 배포해 쓰고 계셨다면, Apps Script 편집기에서
  코드를 이 버전으로 교체하고 다시 배포해야 시트 컬럼이 맞게 기록됩니다.**

### 2. 구글시트 기록 확인 실패 메시지 진단 개선
"확인 실패"라고만 뜨던 것을, 원인별로 다르게 표시하도록 고쳤습니다.
- `/api/chat-log`가 아예 없음(404) → "백엔드에 /api/chat-log 없음 · chat-log.js 재배포 필요"
- 응답은 왔지만 JSON이 아님/서버 오류 → 구체적 HTTP 상태 코드 표시
- 그 외 네트워크 문제 → "백엔드 주소(GFA 백엔드) 확인 필요"

가장 흔한 원인은 Vercel 프로젝트를 새로 만들면서 `api/chat-log.js`,
`api/population.js`, `api/health.js` 중 일부를 함께 올리지 않은 경우입니다.
이 zip 안의 `api/` 폴더 전체를 그대로 올려야 4개 파일이 다 배포됩니다.

### 3. 지도에서 주(State) 클릭 → 그 지역 주거인구 즉시 표시
기존에는 지도를 손으로 패닝해야 자동으로 인구가 갱신됐는데, 어느 지역이
갱신 대상인지 직관적이지 않다는 의견을 반영했습니다. 지도 레이어 패널에
**"주(State) 경계"** 토글을 추가했습니다.
- 켜면 미국 주 경계선이 옅게 표시됩니다(공개 GeoJSON, 별도 백엔드 호출 없음).
- 원하는 주를 클릭하면 지도가 그 주의 중심으로 이동하고, 주거인구가 자동으로
  켜지며 그 지역 카운티 데이터를 즉시 불러옵니다.
- 기존의 "지도를 패닝하면 자동 갱신"되는 동작도 그대로 유지되므로, 두 가지
  방법을 모두 쓸 수 있습니다.

### 4. 학교 졸업률 · 지역 범죄 지표 추가
- **졸업률**: 고등학교 2곳(Haverhill High 82%, Whittier Regional Vocational
  99%)에 4년 졸업률을 표시합니다. 초·중학교는 이 지표가 존재하지 않아
  표시하지 않습니다. 출처: Massachusetts DESE / SchoolDigger 공개 자료.
- **지역 범죄 지표**: 학군 섹션 하단에 Haverhill 시 단위 범죄 지표 카드를
  추가했습니다(폭력범죄·재산범죄, 인구 10만 명당, 전국 평균 대비). 출처:
  FBI UCR(2024년 자료, 2025년 9월 공개) 경유 AreaVibes. 조사기관마다 수치
  차이가 커서(예: 일부는 전국 평균보다 안전하다고 보고) 카드에 그 사실과
  현장 확인 권고를 함께 표시했습니다.
- 두 지표 모두 자비스에게 보내는 컨텍스트에도 포함되어, 질문 시 참고합니다.

## Vercel 환경변수

필수:
- `OPENAI_API_KEY`

선택:
- `OPENAI_MODEL` (기본 `gpt-5.6`, 실패 시 `gpt-4o-mini` 자동 재시도)
- `ALLOWED_ORIGINS`
- `GFA_CHAT_LOG_WEBHOOK`

**더 이상 필요 없음(제거됨)**: `GEMINI_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL`,
`GROQ_MODEL` — Vercel에 이미 등록되어 있어도 무해하니 지우지 않아도 되지만,
더는 코드에서 참조하지 않습니다.

환경변수를 추가/수정한 뒤 반드시 **Redeploy** 하세요. Preview가 아니라
Production 환경에도 체크되어 있어야 합니다.

## 배포
1. `api/` 폴더 전체(`ai-compare.js`, `population.js`, `chat-log.js`,
   `health.js`)를 GitHub 저장소의 동일 경로로 교체 — 일부만 올리면 위 2번
   문제(구글시트 기록 확인 실패)가 재발합니다.
2. Vercel 환경변수 확인(`OPENAI_API_KEY` 필수)
3. Redeploy
4. (선택) 구글시트 기록을 쓰고 있었다면 Apps Script 코드도 최신 버전으로
   교체 후 재배포
5. HTML을 티스토리에 다시 게시

## 확인 방법
- `/api/health`를 열었을 때 `{"ok":true,"jarvis":true,...}`가 보이면
  정상입니다(`jarvis:false`면 OPENAI_API_KEY 미등록).
- `/api/chat-log`를 GET으로 열었을 때 `{"ok":true,"configured":true|false}`가
  JSON으로 보이면 정상입니다. HTML 404 페이지가 보이면 이 파일이 배포에서
  빠진 것입니다.
- `/api/population?lat=34.0522&lng=-118.2437`(LA 다운타운)처럼 Haverhill이
  아닌 좌표로 열어봤을 때 `_county_name`이 그 지역 이름으로 나오면 정상입니다.

## 참고
주거인구 자동 갱신은 미국 Census Geocoder(1차) + FCC Area API(대체) + Census
Reporter ACS를 사용하므로 미국 영역에서 동작합니다. 주 경계 클릭 기능은
PublicaMundi의 공개 US States GeoJSON을 사용합니다.
