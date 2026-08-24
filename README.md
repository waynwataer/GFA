# GFA Haverhill Dashboard · Jarvis v5.1 (안정성 보강)

## 이번 업그레이드에서 고친 것
- **[중요] Groq 모델 교체**: `llama-3.3-70b-versatile`과 `llama-3.1-8b-instant` 둘 다
  Groq가 2026-06-17 폐기(deprecated) 공지했고 2026-08-16 서비스가 완전히
  종료되었습니다. 이전 설정은 1차·2차 모델이 모두 종료된 모델이라 Groq 호출이
  항상 실패했습니다. 공식 권장 대체 모델인 `openai/gpt-oss-120b` →(실패 시)
  `openai/gpt-oss-20b` 순으로 재시도하도록 교체했습니다.
- **OpenAI도 동일한 폴백 패턴 적용**: 기본 모델을 계정에서 못 쓰는 경우
  `gpt-4o-mini`로 자동 재시도합니다(Gemini/Groq와 동일한 안정성 확보).
- **주거인구 프록시 이중화**: Census Geocoder가 응답하지 않을 때 FCC Area API로
  자동 대체합니다(기존엔 대체 경로가 없어 Census 쪽 일시 장애 시 전체가 실패).
- **주거인구 payload 반경 제한(45km)**: LA County처럼 매우 큰 카운티에서 지도
  반대편 끝 Block Group까지 전부 실어오지 않도록 제한해 응답 속도를 높였습니다.
- **CDN 캐시 적중률 개선**: 지도 중심 좌표를 소수점 2자리(≈1.1km)로 반올림해
  보내도록 프론트엔드를 수정 — 카운티 단위 데이터라 정밀도 손실 없이, 살짝씩
  다르게 패닝해도 24시간 Edge 캐시가 재사용됩니다.
- `/api/chat-log`도 다른 엔드포인트와 동일하게 `ALLOWED_ORIGINS`를 존중하도록
  통일했습니다.
- Gemini 무료 티어 우선: `gemini-2.5-flash-lite` → 실패 시 `gemini-2.5-flash` 재시도
- API 키 미설정/인증/한도 오류를 한국어로 구분 표시
- 지도 중심이 다른 미국 지역으로 이동하면 현재 County를 자동 판별하여 ACS Block Group 주거인구를 다시 로딩

## Vercel 환경변수
필수(무료 우선):
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

선택:
- `OPENAI_API_KEY`
- `GEMINI_MODEL` (기본은 코드가 무료 우선 자동 선택)
- `GROQ_MODEL` (기본 `openai/gpt-oss-120b`, 실패 시 `openai/gpt-oss-20b` 자동 재시도)
- `OPENAI_MODEL` (기본 `gpt-5.6`, 실패 시 `gpt-4o-mini` 자동 재시도)
- `ALLOWED_ORIGINS`
- `GFA_CHAT_LOG_WEBHOOK`

환경변수를 추가/수정한 뒤 반드시 **Redeploy** 하세요. Preview가 아니라 Production 환경에도 체크되어 있어야 합니다.

## 배포
1. `api/ai-compare.js`, `api/population.js`, `api/chat-log.js`를 GitHub 저장소의 동일 경로로 교체
2. Vercel 환경변수 확인
3. Redeploy
4. HTML을 티스토리에 다시 게시

## 확인 방법
- `/api/ai-compare`에 `{"mode":"groq","question":"테스트"}`로 POST 했을 때
  `result.model`이 `openai/gpt-oss-120b` 또는 `openai/gpt-oss-20b`로 나오면
  정상입니다. 예전처럼 `llama-3.3-70b-versatile`이 보이면 재배포가 반영 안 된
  것입니다.
- `/api/population?lat=34.0522&lng=-118.2437`(LA 다운타운)처럼 Haverhill이 아닌
  좌표로 열어봤을 때 `_county_name`이 그 지역 이름으로 나오면 정상입니다.

## 참고
주거인구 자동 갱신은 미국 Census Geocoder(1차) + FCC Area API(대체) + Census
Reporter ACS를 사용하므로 미국 영역에서 동작합니다.

