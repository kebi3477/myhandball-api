# myhandball-api

한국 핸드볼 리그(H리그)의 일정·순위·기록 API. NestJS 10.

- 데이터는 전부 `koreahandball.com` 스크래핑 (`.env`의 `BASE`). `robots.txt`는 전면 허용
- 전역 prefix `/api` (`src/main.ts`), **인증 없음**
- Redis 캐시(`CacheService`). Postgres(TypeORM)는 `welcome`(환영 설문), `live`(경기 중계·상태),
  `engagement`(예측·MVP 투표·응원글·신고·차단), `push`(푸시 토큰·발송 기록), `profile`(닉네임),
  `catalog`(경기 카탈로그), `attendance`(직관 기록)에서 사용

## 클라이언트와 하위 호환

클라이언트가 둘이다.

1. **기존 React 웹** (`../_legercy/myhandball/apps/web`) — 운영 중, 건드리지 않는다
2. **새 Flutter 앱** (`../myhandball-app`) — 전 화면 구현 완료, 데이터만 목업.
   `HandballApiService`의 HTTP 구현체만 추가하면 붙는다. 그래서 **응답 스펙을 앱
   도메인 모델과 맞추는 것**이 이 저장소 작업의 핵심이다. 지금 응답 스펙(각 모듈의
   `types.ts`)을 임의로 바꾸지 말 것. 원래 지시서 스펙과 달라진 점은 07 C에 모아 두었다

웹이 쓰는 `/api/schedule`, `/api/ranking`, `/api/team`에 대해:

- **필드 추가는 OK, 제거·이름 변경·타입 변경은 금지**
- 쿼리 파라미터 기본값도 웹이 기대는 동작이므로 바꾸지 않는다 (아래 표 참고)
- 새 엔드포인트는 자유롭게 추가 가능
- 이 제약은 웹을 내릴 때까지 유지된다

## 스크래핑 규칙

### 공통 파라미터 (원본 사이트)

| 파라미터 | 값 | 의미 |
|---|---|---|
| `league_gender` | `M` / `W` | 남자부 / 여자부 |
| `league_season` | `2025` | **시작 연도**. 2025 = 25-26 시즌 |
| `league_type` | `1` / `2` | 정규리그 / 포스트시즌 |
| `league_season_month` | `11` | 월 (일정에서만) |

우리 API는 이를 `gender` / `season` / `type` / `month` 쿼리로 받는다.
**기존 엔드포인트의 기본값이 서로 다르다**는 점에 주의:

| 엔드포인트 | 원본 페이지 | gender 기본 | season 기본 | 잘못된 gender | 캐시 |
|---|---|---|---|---|---|
| `GET /api/schedule` | `/game/schedule_list.php` | `W` | `2025` | 빈 문자열이면 파라미터 생략, 그 외 그대로 전달 | 오늘 경기 있으면 60초, 없으면 10분 |
| `GET /api/schedule/ics/my-team` | 위 페이지를 1~12월 **순차 12회** 요청 | `W` | `2025` | — | 일정 캐시를 탐 |
| `GET /api/ranking` | `/game/teamranking.php` | `W` | **`2024`** (갱신 안 됨) | `W`로 강제 | 없음 |
| `GET /api/team` | `/introduce/team_{men,women}.php` | `W` | — | `W`로 강제 | `teams:{M\|W}`, **24시간** |

새 엔드포인트는 `season` 기본값을 현재 시즌(2025)으로 둔다.

### 기존 파싱 관례

- HTTP는 서비스마다 같은 `axios.get` 옵션을 복붙해 쓴다: 브라우저 UA,
  `Accept-Language: ko`, `timeout: 15000`, `responseType: "text"`, `maxRedirects: 3`,
  `validateStatus: 2xx~3xx`
- `absUrl()`(상대 경로 → `BASE` 기준 절대 URL)과 `textOrNull()`(trim 후 빈 문자열이면
  `null`)이 **기존 세 서비스에 각각 복사돼 있다**. 새 모듈은 `src/common/scrape.ts`의
  공용 헬퍼(`fetchHtml`, `absUrl`, `textOrNull`, `intOrNull`, `splitMadeAttempt`,
  `kstIso`, `matchSeqFromHref`)를 쓴다. 기존 3개 서비스의 복사본은 건드리지 않는다
- 이미지·링크 URL은 반드시 `absUrl`로 절대 URL로 만들어 내보낸다
- 순위표는 원본이 좌(순위·팀) / 우(기록) 두 테이블로 나뉘어 있어 **행 인덱스로
  병합**한다. 행 수가 어긋나면 짧은 쪽에 맞춰 잘린다. 경기 선수기록 표도 같은 구조다
  (`.fixed_table` 배번·이름 + `.scroll_table` 기록)
- 공용 타입 `Gender`(`"W" | "M"`)는 `src/team/types.ts`에 있고, 다른 모듈이 여기서
  import한다

### 원본 사이트에서 실측한 함정 (문서와 다른 점)

- **일정의 `<tr id>` / `ul#m…` 숫자는 경기 시작 시각이 아니라 경기일 00:00 KST의
  epoch다.** 게다가 `<tr id>`는 그날 첫 행에만 붙는다. 경기 시작 시각은 날짜 +
  `time`을 KST로 합쳐 계산한다 (`GameItem.startsAt`, `kstIso`)
- 일정 페이지에는 표(PC)와 `.record_list.mo_only` 리스트(모바일) 두 벌이 있고, 기존
  코드는 리스트 쪽을 파싱한다. 리스트 `li`에도 `match_seq` 링크가 있다
- `detail.php`의 도넛 차트(`Total shots` 등) 퍼센트는 용어설명과 달리 **성공률이 아니라
  양 팀 시도 수의 점유율**이다 (두 값의 합이 100). 그래서 슛 성공률은 선수기록을
  합산해서 계산한다
- 약어 `DR`은 드리블 반칙이 아니라 **블루카드**다 (용어설명 팝업 기준)
- 존재하지 않는 `match_seq`도 200과 빈 골격을 돌려준다. 팀명과 날짜가 비어 있으면
  404로 처리한다
- 선수기록 페이지는 팀마다 `.record_table`이 하나씩 있고(홈 → 원정), 그 안에 필드
  선수 표와 `h3.con_title 골키퍼` 표가 따로 있다. 골키퍼 표의 위치별 칸은 **방어**
  기록이다
- 출전시간은 `"00:58:20"`(시:분:초) 형식이고, 출전하지 않은 선수는 `"0"`이다.
  시즌 누적은 `"19:00:05"`(시:분:초), 선수 상세는 `"7189:51"`(총 분:초)로 형식이 섞여
  있다. 우리 응답은 **총 분:초**로 통일한다
- `/record/player.php`에는 **경기 수, 배번, 포지션이 없다**. 필드 선수만 나오고 골키퍼는
  `player_type=GK`로 따로 조회한다. 배번, 포지션, 사진은 팀 페이지의 "선수 소개" 탭
  (`team_{men,women}.php?team_num=N&page_type=3`)에서 `player_seq`로 붙인다. 현재
  로스터 기준이라 이적하거나 은퇴한 선수는 배번이 `null`이다
- `/record/player.php`의 팀명은 축약형(`인천`, `SK`)이다. 같은 성별의 팀 목록에서 앞부분
  일치로 유일하게 찾을 수 있다
- **팀 이름의 정본은 `TeamService` 목록(`/api/team`)의 이름이다** (`상무피닉스`, 공백 없음).
  일정·순위 원본은 `상무 피닉스`로 공백이 있어서, `TeamService.canonicalNames()`(공백을 뺀
  키로 매칭)로 목록 이름에 맞춘다. 못 찾으면 원본을 두고 warn한다. 새 엔드포인트에서 팀
  이름을 내보낼 때도 이걸 거친다. 앱과 v1 웹 모두 이름이 같으면 같은 팀으로 본다
- `TeamService`는 `TeamListModule`에 따로 있다. `TeamModule`이 일정·순위 모듈을 쓰고
  일정·순위가 다시 `TeamService`를 쓰기 때문에, 순환을 피하려고 분리했다
- 팀 식별자가 두 종류다. `team_num`(149, 우리 `teamNum`)과 `team_seq`/`g-api`(1~11,
  기록실 필터와 `logo_api/logo_m_N.png`)이다. 각 페이지 상단 GNB의 `img[g][g-api]`에
  둘의 대응이 있다
- 선수 상세의 시즌별 기록 중 정규리그 행을 합하면 "정규리그 통산" 표와 일치한다.
  통산 표에는 열이 적어서 합산으로 채우고, 표에 있는 값은 원본을 우선한다
- `playerranking.php`는 14개 카테고리의 TOP5만 준다. 제목은 `"득점 TOP5"` 형식이고
  1위는 `.rank_first`, 2~5위는 `.rank`로 마크업이 다르다
- 존재하지 않는 `player_seq`도 200과 빈 골격(`"No. []"`)을 준다
- 팀 페이지 탭 4개는 각각 별도 URL(`page_type=1` 소개·연혁, `2` 코칭스태프, `3` 선수,
  `4` 시즌별 팀기록)이다. 창단 연도와 연고지 전용 필드는 없어서 소개 본문에서 뽑는다.
  "창단 이후"처럼 연도가 창단이 아닌 문맥이 섞이고, 연고지를 적은 팀은 SK호크스와
  상무뿐이다. 홈구장 정보도 없다
- 팀 주소는 `display:none` 영역에 있고, 여러 팀이 `서울 송파구 올림픽로 19-2
  서울종합운동장`이라는 자리표시 값을 쓴다. 이 값은 `null`로 거른다. SNS 링크에도
  `pndcom` 같은 쓰레기 값이 있어 `http(s)`만 받는다
- `teamranking_part.php`는 라운드별 순위가 아니라 부문별 팀 순위다. 라운드별 순위
  추이는 원본에 없어서, 팀 상세는 일정에서 만든 승무패 배열(`results`)만 준다
- 일정 API는 `month` 없이 부르면 시즌 전체를 준다 (남자부 2025 시즌 75경기)
- HTML 소스의 개행은 들여쓰기용이다. 줄바꿈을 살릴 때는 `<br>`, `</p>`만 기준으로 한다
- **경기 중계 데이터는 `playbyplay.php?match_seq=N`(PBP)에 있다.** 전·후반 표마다 행이
  하나씩이고 열은 경기 시계 | 홈 행동 | 누적 스코어(득점 행만) | 점수차 | 원정 행동이다.
  득점자, 어시스트, 선방, 2분 퇴장, 타임아웃이 모두 있고 마지막 행은 `경기종료`다.
  시계는 하프마다 00:00부터 다시 센다. `경기종료` 행은 시계가 00:00으로 찍힌다.
  `GoalKeeper`에 "GOAL"이 들어 있으니 득점 판정은 대소문자를 구분해 `\bGOAL\b`로 한다
- 문자중계 `timeline.php`는 10초, 30초, 60초 자동 새로고침을 지원한다. 경기 중 갱신을
  전제로 만든 페이지라는 뜻이다. 다만 **PBP가 경기 중 실시간으로 갱신되는지는 아직
  확인하지 못했다** (2026-09-23 기준 비시즌). 개막 후 첫 경기에서 `live_events`가 늘어나는지
  확인해야 한다. 폴러는 PBP가 끝까지 비어 있으면 `warn`을 남긴다

### 원칙 (새 코드에 적용)

- **파싱 실패는 500이 아니라 빈 값 + 로그.** 한 항목이 깨져도 나머지는 나가야 한다.
  클라이언트는 빈 상태 화면을 갖고 있다
  - 주의: 기존 3개 서비스는 이 원칙을 지키지 않는다. 요청 실패나 파싱 오류가 그대로
    500으로 전파된다. 기존 동작은 두고, 새 코드부터 지킨다
- 파싱 결과가 0건이면 `Logger.warn`을 남긴다. 원본 HTML 개편을 빨리 알아채기 위함
- 셀렉터는 추측하지 말고 실제 페이지를 받아 확인한다. 지금까지 실측한 구조는 각 파서의
  주석과 위 "실측한 함정"에 있다

### 캐시

- `CacheService`는 `getJSON` / `setJSON(key, value, ttlSec?)` / `del`만 있는 얇은
  래퍼다. `ttlSec`를 빼면 **만료 없이** 저장되니 반드시 넘긴다
- `CacheModule`은 `@Global`이지만 `AppModule`에 등록돼 있지 않고 `TeamModule`이
  import해서 올라온다. 새 모듈에서 쓸 때는 해당 모듈에서 `CacheModule`을 import한다
- 키 형태는 `teams:M`처럼 `{도메인}:{파라미터}`
- **경기 중 데이터는 캐시하지 않는다** (아래 "실시간 폴링" 참고). TTL은 각 서비스의 상수에 있다
- 경기 단위 캐시(`game:{matchSeq}`)는 `startsAt` 기준으로 정한다. 시작 전이면
  min(10분, 시작까지 남은 시간), 시작 후 3시간 안이면 캐시 안 함, 그 뒤로는 24시간
  (`GameService.ttlFor`)

## 응답 스펙 원칙

- 응답 타입은 각 모듈의 `types.ts`에 둔다
- 숫자로 쓸 값은 숫자로 준다. 기존 `GameItem.scoreText`(`"20 : 23"`, 경기 전
  `"- : -"`)처럼 문자열로 주는 실수를 반복하지 않는다. 새 필드는
  `scoreHome: number | null` 형태로 만든다. 기존 필드는 하위 호환 때문에 그대로 둔다
- 날짜는 ISO 8601 문자열로 준다. 원본 라벨이 필요하면 `~Label` 필드를 따로 둔다
  (기존 `dateLabel` / `dateISO` 쌍과 같은 방식)
- 비어 있으면 `null` 또는 `[]`를 준다. `undefined`는 내보내지 않는다(JSON에서 키가
  사라진다). `tsconfig`가 `strictNullChecks: false`라 컴파일러가 잡아주지 않으니
  직접 챙긴다
- 기존 응답은 최상위에 원본 `url`과 요청 파라미터(`leagueGender` 등)를 함께
  돌려준다. 새 엔드포인트도 같은 형태를 따른다

## DB (TypeORM / Postgres)

- 엔티티: `WelcomeSubmission`(`welcome_submissions`), `LiveEvent`(`live_events`),
  `MatchState`(`match_states`), `Prediction`(`predictions`), `MvpVote`(`mvp_votes`),
  `Cheer`(`cheers`), `CheerLike`(`cheer_likes`), `CheerReport`(`cheer_reports`), `Block`(`blocks`),
  `PushToken`(`push_tokens`), `PushLog`(`push_logs`), `Profile`(`profiles`), `MatchMeta`(`match_meta`),
  `Attendance`(`attendances`). 컬럼은 `@Column({ name: 'snake_case' })`로 매핑하고,
  시각은 `timestamptz`
- 모듈은 `TypeOrmModule.forFeature([Entity])`로 등록한다. `autoLoadEntities: true`라
  엔티티 목록을 따로 관리하지 않는다
- **`synchronize: true`다.** 엔티티를 고치면 운영 DB 스키마가 기동할 때 자동으로
  바뀐다. 사용자 데이터(예측·투표·응원글·푸시 토큰)가 쌓이므로 **컬럼 이름 변경·삭제 금지**. 운영 전에
  마이그레이션으로 전환해야 한다 (07 B-4)
- 입력 검증은 class-validator 없이 컨트롤러에서 직접 하고 `BadRequestException`을
  던진다 (`welcome.controller.ts`)

## 실시간 폴링 (src/live)

- `LivePollerService`: 매일 06:00 KST와 기동할 때 오늘 경기를 모은다. 시작 10분 전부터
  경기별로 60초 간격으로 PBP를 받는다. **60초 밑으로 내리지 않는다.** 실패하면 지수
  백오프하고, 5회 연속 실패하면 그 경기의 폴링을 중단한다. `경기종료`를 보거나, 변화 후
  20분이 지나거나, 시작 +150분이면 멈춘다. `LIVE_POLLING=false`로 끌 수 있다
- 경기 상태는 `live/match-status.ts`의 `computeStatus` 하나로 판정한다. 일정 API와 라이브
  API가 같이 쓴다. 시작이 지났는데 변화를 한 번도 못 봤으면 `pre`를 유지한다 (폴링이 안
  되는 상황에서 모든 경기가 LIVE로 보이는 걸 막기 위함)
- `live_events`는 폴링할 때마다 PBP와 맞춘다. 행은 `half|clock|homeText|awayText` 키로
  식별하고, 원본에서 정정돼 사라진 행은 지운다. `observed_at`은 처음 본 시각이고, 종료 후
  한꺼번에 채운 행은 `null`이다
- 폴링한 적 없는 끝난 경기는 `/api/game/:matchSeq/live`를 처음 요청할 때 PBP로 한 번
  채운다. PBP가 비어 있던 경기는 6시간 동안 다시 부르지 않는다
- 일정 API는 원본을 캐시하고(오늘 경기가 있으면 60초, 없으면 10분), `status`는 캐시와
  별개로 매 요청 `match_states`를 보고 새로 붙인다
- 기존 Redis 프로바이더에 종료 훅이 없어서 `app.close()`가 끝나지 않는다. 스크립트에서
  앱 컨텍스트를 쓸 때 주의

## 사용자 콘텐츠 (src/engagement)

- 인증이 없다. 앱이 만든 난수 UUID를 `X-Device-Id` 헤더로 받아 **중복만 막는다**
  (`device-id.decorator.ts`, 영문·숫자·하이픈 8~64자). 조회는 헤더 없이도 되고, 쓰기는
  헤더가 없으면 400
- 예측은 시작 전까지 덮어쓰기(`upsert`)가 가능하다. MVP는 종료 후(`computeStatus`) 1회만
  가능하고, 재투표는 unique 제약 위반 → 409
- MVP 후보는 경기 선수기록(`/api/game/:matchSeq`)의 득점+어시스트 상위 5명이다. 경기 기록에는 `player_seq`가
  없어서 `PlayerService.lookupPlayerSeq`(로스터의 이름·배번)로 찾는다. 못 찾으면 `null`이고
  이름으로 투표한다
- 쓰기 엔드포인트에만 `ThrottlerGuard`(IP 기준 분당 30회)를 건다. 조회에는 걸지 않는다.
  `ThrottlerModule`은 전역 모듈이라 `AppModule`에서 한 번만 `forRoot`한다.
  프록시 뒤에서는 `trust proxy` 설정이 필요하다 (07 B-2)
- 응원글 작성자는 익명이다. 서버가 이름을 만들지 않는다. 차단은 지금 `cheers.hidden`을
  수동으로 켜는 것뿐이다 (07 B-1)

## 앱 v2 기능 (profile · catalog · prediction · attendance · 신고·차단)

- **프로필(`src/profile`)**: `GET/PUT/DELETE /api/profile`. 닉네임 규칙(`nickname.ts`)은 앱
  `domain/models/nickname.dart`와 **반드시 같아야 한다** (앞뒤 공백 제거 후 코드 포인트 2~10자, 한글·자모·영문·숫자만).
  중복은 `nickname_key`(소문자, 공백 제거) unique로 막는다 → 409. `GET`은 없으면 200 + JSON `null`
  (Nest는 null을 빈 본문으로 보내서 `@Res`로 직접 쓴다)
- **경기 카탈로그(`src/catalog`, `match_meta`)**: 예측·직관은 `match_seq`만 가져서 시즌·부·팀·결과를 여기서 붙인다.
  기동 시·30분마다·폴러가 경기 종료를 볼 때 현재 시즌 일정 전체를 동기화하고, **결과가 확정된 경기의 예측에
  `settled`·`hit`을 기록한다**(`settle()`). 일정에 없는 경기(지난 시즌)는 경기 상세로 채운다(`ensure`).
  경기의 시즌은 `seasonOfDate()`로 구한다 — `currentSeason()`은 `CURRENT_SEASON` 고정값을 따르므로 쓰면 안 된다
- **승부예측 조회(`src/prediction`)**: `/api/prediction/{week,leaderboard,fandom,my}`. 랭킹은 프로필이 있고
  확정 10경기 이상(`MIN_SETTLED`)인 기기만, 적중률(반올림 전 비율) → 확정 수 → 닉네임 순, 경쟁 순위(1,1,3).
  팬덤은 응원팀별 합산 적중률이고 팬이 없는 팀도 0으로 남긴다
- **직관(`src/attendance`)**: `GET /api/attendance?season=`, `PUT/DELETE /api/attendance/:matchSeq`. 멱등,
  끝난 경기만(결과 확정 또는 시작 +150분)
- **신고·차단(`src/engagement`)**: 응원글에 `authorId` = HMAC-SHA256(기기 ID, `AUTHOR_ID_SECRET`) 앞 16자
  (`author-id.ts`, `cheers.author_id`에 저장). **`AUTHOR_ID_SECRET`은 바꾸지 않는다** — 바꾸면 차단 목록이 어긋난다.
  신고 3건(`REPORT_HIDE_THRESHOLD`)이면 자동 `hidden`. 차단(`/api/block`)한 작성자의 글은 그 기기의 목록에서 빠진다

## 정책 문서 (src/policy)

- 개인정보 처리방침(`privacy-policy.ts`)과 서비스 이용약관(`terms.ts`). 각각 JSON(`/api/policy/{privacy,terms}`)과
  웹페이지(`/api/policy/{privacy,terms}/page`)로 나간다. 처리방침은 v1 웹의 형식·연락처를 이어받았고,
  이용약관은 v1에 없어서 새로 썼다 (응원글 금지 내용·제재, 예측·투표는 금전 없음, 연맹 비공식·면책)
- **앱은 설정 화면에서 `https://myhandball.lab241.com/privacy`, `/terms`를 외부 브라우저로 연다**
  (앱 `AppConfig.privacyUrl`/`termsUrl`). 이 짧은 주소는 Caddy가 `/page` 경로로 이어 준다. 문구는
  앱 심사 없이 여기서 고친다
- **DB에 저장하는 항목, 보관 기간, 외부 전송(FCM 등)을 바꾸면 이 문서도 같이 고치고
  `version`·`effectiveDate`를 올린다.** 지금 기준: 기기 ID, 예측·투표·응원글·좋아요, 푸시 토큰,
  첫 설정(성별·연령대·마이팀), IP는 쓰기 제한에만 1분 메모리 사용, 쿠키 없음, 국외 이전은 Google(FCM)·Apple(APNs)

## 푸시·위젯 (src/push, src/widget)

- 푸시는 폴러(`LivePollerService`)가 부른다. 시작 10분 전(폴링 시작 시 경기 전일 때만), 득점,
  종료. 시작·종료는 `push_logs`의 unique(match_seq, kind)로 경기당 한 번만 나가고,
  득점은 `PushService`가 120초 창으로 묶는다(창은 메모리). 푸시 실패는 폴링을 멈추지 않는다
- FCM 자격증명(`FCM_*`)이 없으면 **드라이런**이다. 발송 대신 `[dry-run]` 로그를 남긴다
- `POST /api/push/test`: `X-Device-Id`의 그 기기에게만 테스트 알림 1건 (`data.kind: "test"`, `matchSeq` 없음,
  `push_logs` 기록 안 함, 기기당 1분 1회 + ThrottlerGuard). 드라이런이면 200 `{ sent: false, dryRun: true }`.
  비시즌에 실발송 경로와 서버의 드라이런 여부를 확인하는 용도다. FCM 호출은 `deliver()` 하나로 모았다
- 대상은 경기 두 팀 중 하나를 마이팀으로 등록한 기기다. 종료 알림은 받는 팀 기준으로 승·패·무를 붙인다
- 위젯 상태 판정은 순수 함수 `widget.builder.ts`의 `buildWidget(games, now)`다. 시각을
  넣어 과거 시즌 데이터로 검증할 수 있다. 위젯은 자체 캐시가 없다
- 현재 시즌은 `common/season.ts`의 `currentSeason()`(KST 8월부터 새 시즌)이다. 폴러와 위젯이 같이 쓴다.
  **`CURRENT_SEASON` 환경변수가 있으면 그 값으로 고정**한다 (지금 `.env`는 `2025` = 25-26 시즌)
- 위젯은 개발 환경에서 `?now=<ISO 8601>`로 시각을 옮길 수 있다 (`+`는 `%2B`로 인코딩).
  그 시각 기준으로 상태를 다시 계산하고, `NODE_ENV=production`에서는 무시한다

## 엔드포인트 (API 작업 지시서 00~06 완료)

지시서 원문은 완료 후 지웠다 (git 이력에 있음). **남은 일과 확인할 것은
`docs/api-tasks/07-후속-작업.md`에 모으고, 새로 알게 된 후속 과제도 여기에 쌓는다.**

| 모듈 | 엔드포인트 |
|---|---|
| schedule·ranking·team (기존, v1 웹 사용) | `GET /api/schedule`, `/api/schedule/ics/my-team`, `/api/ranking`, `/api/team` |
| game | `GET /api/game/:matchSeq` (전·후반, 팀 기록, 선수별 기록) |
| player | `GET /api/player`, `/api/player/:playerSeq`, `/api/player/ranking` |
| team (상세) | `GET /api/team/:teamNum` (구단 소개, 코칭스태프, 선수, 팀 기록, 전적) |
| live | `GET /api/game/:matchSeq/live` + PBP 폴링 워커, 일정에 경기 상태 |
| engagement | `GET/POST /api/game/:matchSeq/{prediction,mvp}`, `/api/team/:teamNum/cheer` (+ `DELETE`, `/like`) |
| push·widget | `POST/DELETE /api/push/register`, `GET /api/widget/my-team` |
| policy | `GET /api/policy/{privacy,terms}` (JSON), `/api/policy/{privacy,terms}/page` (웹페이지), 짧은 주소 `/privacy`, `/terms` (Caddy) |
| profile | `GET/PUT/DELETE /api/profile` |
| prediction | `GET /api/prediction/{week,leaderboard,fandom,my}` |
| attendance | `GET /api/attendance`, `PUT/DELETE /api/attendance/:matchSeq` |
| 신고·차단 | `POST /api/team/:teamNum/cheer/:cheerId/report`, `GET/POST /api/block`, `DELETE /api/block/:authorId` |

- **live와 push는 "경기 중에 PBP가 실시간으로 갱신된다"는 미검증 가정 위에 있다.**
  가정이 틀리면 LIVE와 득점 푸시가 저절로 나가지 않는다. 개막(11월) 후 첫 경기에서 먼저
  확인한다 (07 A-1, A-4)

## 실행·검증

```bash
npm run dev      # nest start --watch
npm run build && npm run lint
curl -s 'http://localhost:3000/api/schedule?gender=M&season=2025&type=1' | jq
```

패키지 매니저는 **npm**이다 (`package-lock.json`). pnpm·turbo 모노레포(`@koha`)에서
분리된 저장소라, 옛 흔적(`pnpm --filter`, `@koha/config`, `apps/api/` 경로)은 다시
들이지 않는다. 테스트 러너는 아직 없으므로 검증은 빌드, lint, 실제 기동 후 curl로 한다.

- `tsconfig.json`은 `strictNullChecks: false`, `noImplicitAny: false`로 느슨하다.
  `esModuleInterop: true`가 빠지면 `import dayjs from "dayjs"`가 런타임에 깨진다
- `src/cache/...` 같은 `src/` 절대 경로 import가 일부 있다 (`baseUrl: "./"`).
  새 코드는 상대 경로를 쓴다

`.env`: `BASE`, `PORT`, `REDIS_URL`, `DATABASE_URL`, `DATABASE_SSL`. 기동하려면 Redis와
Postgres가 모두 연결돼야 한다. CORS는 `CORS_ORIGINS`(쉼표 구분)로 지정하고, 없으면
`localhost:5173` 계열만 허용한다. `.env.example`에는 `CORS_ORIGINS`가 없다. 네이티브
앱은 CORS의 영향을 받지 않는다.

## 서버 운영 상태 (주의)

API 도메인은 **`myhandball.lab241.com`** 이다 (회사 도메인 `lab241.com`의 하위 도메인, DNS는 가비아).
예전 `myhandball.kro.kr`은 Let's Encrypt `kro.kr` 공용 발급 한도에 막혀 버렸다.
가정 회선에서 자체 호스팅하며, **집의 미니 PC에 도커로 올린다**
(`deploy/docker-compose.yml`: api + postgres + redis + caddy, 순서는 `deploy/README.md`).
HTTPS는 Caddy가 인증서를 자동으로 발급·갱신한다 (`deploy/Caddyfile`, `/api/*`만 api로 넘김).
공유기가 내부에서 공인 IP로 되돌아오는 접속을 지원하지 않아서, 집 안 기기는 **`http://<미니 PC IP>:8080`**
(Caddy의 LAN 전용 HTTP 입구, 같은 라우팅)으로 붙는다. 8080은 공유기에서 포워딩하지 않는다.
`lab241.com`에는 와일드카드(`*.lab241.com` → 회사 서버)가 있어서 `myhandball` 전용 A 레코드가 필요하다.
API의 `trust proxy`는 `TRUST_PROXY` 환경변수로 정한다 (기본 `loopback`, 도커는 `uniquelocal`).
공유기 포트포워딩(443·80 → 미니 PC)이 남아 있다 (07 B-3).

**앱은 웹과 달리 인증서가 만료되면 완전히 먹통이 된다** (iOS ATS / Android cleartext
차단). 배포 관련 작업을 하게 되면 이 점부터 먼저 짚는다.
