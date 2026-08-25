# GFA Haverhill Dashboard · 자비스(Jarvis) 백엔드 v7.0

## 이번 업그레이드 (v7) — 임의 도시 종합 비교
새 엔드포인트 **`/api/area-profile`** 를 추가했습니다. 이제 대시보드의 "도시 비교" 패널에서
**아무 미국 도시나** 입력하면 Haverhill과 같은 기준으로 세 지표를 실시간 조립해 비교합니다.

| 지표 | 소스 | API 키 | 비고 |
|------|------|--------|------|
| 주거인구 | U.S. Census ACS 5-year (place 단위) | 불필요 | 최신 연도 우선, 순차 폴백 |
| 공립학교 수·구성·재학생 | NCES CCD Directory (Urban Institute Education Data Portal) | 불필요 | CCD 최신 연도(2022) 우선 |
| 범죄율 | FBI Crime Data Explorer | 선택(FBI_API_KEY) | 키 없으면 프런트 내장 참고값으로 대체 |

요청: `GET /api/area-profile?city=Brockton&state=MA&lat=42.0834&lng=-71.0184`

- 세 소스는 병렬(allSettled)로 호출되어, 하나가 실패해도 나머지는 정상 반환됩니다.
- 없는 값은 지어내지 않습니다. 각 블록의 available 플래그와 error/source/year 를 그대로
  프런트로 넘겨, 대시보드가 "실시간 API / 일부 fallback / 참고값" 배지로 투명하게 표시합니다.

### 범죄율 주의
FBI CDE는 API 키가 필요하고 도시→ORI 매핑이 불안정합니다.
- 키가 없으면 crime.available=false 로 두고 대시보드가 검증된 내장 참고값(AreaVibes 경유 FBI UCR)으로 보완합니다.
- 키가 있으면 현재는 안정성을 위해 주(State) 단위 추정치를 반환합니다(crime.scope="state").

## 환경변수
| 변수 | 필수 | 용도 |
|------|------|------|
| OPENAI_API_KEY | 예 | 자비스(AI) |
| ALLOWED_ORIGINS | 권장 | CORS 허용 도메인(쉼표 구분) |
| FBI_API_KEY | 아니오 | 범죄율 실시간 조회(없으면 참고값 사용) |
| OPENAI_MODEL | 아니오 | 기본 모델 오버라이드 |

## 배포
1. 이 폴더 전체를 Vercel로 배포(또는 기존 프로젝트에 api/area-profile.js 추가)
2. 위 환경변수 설정 후 Redeploy
3. 대시보드 상단 "시트 연결"의 백엔드 주소가 저장돼 있으면 자동 연결
4. HTML을 티스토리에 다시 게시

## 엔드포인트
- GET  /api/health        — 상태 확인
- GET  /api/population     — 지도 중심 카운티 주거인구(Block Group)
- GET  /api/area-profile   — [신규] 도시 종합 프로파일(인구·학교·범죄)
- POST /api/ai-compare     — 자비스(AI)
- POST /api/chat-log       — 구글시트 대화 기록
