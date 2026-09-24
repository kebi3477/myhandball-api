# 앱 연동용 API 응답 모음

2026-09-24 기준. 앱(`myhandball-app`)이 새 엔드포인트를 붙일 때 참고하는 **실제 응답 원문**이다.

- **운영** 표시: 운영 서버(`https://myhandball.lab241.com`)에서 받은 응답. 설정값(시즌·앱 버전)이 들어간 것
- **로컬** 표시: 운영에 배포된 것과 **같은 코드**를 로컬에서 띄우고, 값이 채워진 기기를 만들어 받은 응답.
  운영 DB에는 테스트 데이터를 넣지 않았다 (랭킹에 테스트 닉네임이 뜨지 않도록)
- 응답 모양이 바뀌면 이 문서도 다시 만든다

## 1. 배포 상태

모두 **운영에 배포돼 동작한다** (운영에서 200 응답 확인, 2026-09-24).

| 엔드포인트 | 운영 | 비고 |
|---|---|---|
| `GET/PUT/DELETE /api/profile` | ✅ | 프로필이 없으면 `GET`은 200 + `null` |
| `GET /api/prediction/week` | ✅ | 비시즌이라 지금은 `games: []` |
| `GET /api/prediction/leaderboard` | ✅ | `meTopPercent` 추가 (아래 "스펙과 다른 점") |
| `GET /api/prediction/fandom` | ✅ | |
| `GET /api/prediction/my` | ✅ | |
| 예측 적중 판정 (`settled`/`hit`, 과거분 소급) | ✅ | 기동 시·30분마다·경기 종료 감지 시 |
| `GET/PUT/DELETE /api/attendance` | ✅ | |
| `GET/PUT /api/progress/guide` | ✅ | |
| `GET/PUT/DELETE /api/favorites/players` | ✅ | |
| `GET /api/season` | ✅ | `nextOpensAt`은 아직 `null` (6번) |
| `GET /api/app/version` | ✅ | iOS만 설정됨. android는 404 |
| 응원글 `authorId` | ✅ | |
| `POST /api/team/:teamNum/cheer/:cheerId/report` | ✅ | |
| `POST/GET/DELETE /api/block` | ✅ | |

### 스펙과 다른 점 (앱 모델에 반영할 것)

| 엔드포인트 | 다른 점 |
|---|---|
| leaderboard | `meTopPercent: number \| null` 추가 = max(1, ceil(전체 순위/전체 인원×100)), **범위가 team이어도 전체 기준**. 랭킹 밖이면 null. `meHint`에 "이 랭킹은 해당 팀을 응원팀으로 고른 사람만 올라가요"(팀 범위인데 응원팀이 다를 때)가 있다 |
| leaderboard | `me`는 내가 `rows` 안에 있어도 채워 준다 |
| profile `PUT` | `teamNum`이 `gender`와 맞지 않으면(여자부에 남자팀 등) **404** |
| attendance `PUT` | 응답은 `{ matchSeq, attendedAt }`. 앞으로 할 경기는 400, 없는 경기는 404 |
| favorites `PUT` | 응답은 `{ playerSeq, addedAt }`. `playerSeq`가 숫자가 아니면(`n:홍길동`) 400 |
| progress/guide `PUT` | `doneCount`는 정수만 (문자열 `"5"`도 400) |
| report | 응답 `201 { "reported": true }`. `cheerId`는 숫자. 내 글은 400, 숨겨진 글은 404 |
| block `POST` | 응답 `201 { authorId, createdAt }`, 이미 차단해도 201. `GET`은 `{ items: [{ authorId, createdAt }] }` |
| app/version | 값을 설정하지 않은 플랫폼은 **404** → 안내를 띄우지 않으면 된다 |
| my | `startsAt`이 `Z`(UTC) 형식. 일정(`+09:00`)과 섞여 있지만 둘 다 ISO 8601 |
| 공통 | `X-Device-Id`는 영문·숫자·하이픈 8~64자. 없거나 형식이 틀리면 400 |

## 2. 실제 응답

### 프로필

### GET /api/profile

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "nickname": "날쌘피벗12",
  "teamNum": 123,
  "teamName": "SK슈가글라이더즈",
  "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
  "gender": "W",
  "createdAt": "2026-09-24T12:30:03.185Z",
  "updatedAt": "2026-09-24T12:30:03.185Z"
}
```

### PUT /api/profile

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

본문: `{"nickname":"날쌘피벗12","teamNum":123,"gender":"W"}` (자기 닉네임 그대로 다시 저장 → 200, createdAt 유지)

```json
{
  "nickname": "날쌘피벗12",
  "teamNum": 123,
  "teamName": "SK슈가글라이더즈",
  "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
  "gender": "W",
  "createdAt": "2026-09-24T12:30:03.185Z",
  "updatedAt": "2026-09-24T12:30:03.185Z"
}
```

### GET /api/profile

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: nobody-0000-0000-0000-000000000000)

프로필이 없는 기기 → **200 + `null`** (404 아님)

```json
null
```

### 시즌·앱 버전 (운영 설정값이 들어간 응답)

### GET /api/season?gender=M

→ **200** · 운영  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "gender": "M",
  "opensAt": "2025-11-15T15:20:00+09:00",
  "closesAt": "2026-05-03T14:00:00+09:00",
  "isOffseason": true,
  "nextSeason": "2026",
  "nextOpensAt": null
}
```

### GET /api/season?gender=W

→ **200** · 운영  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "gender": "W",
  "opensAt": "2026-01-10T14:00:00+09:00",
  "closesAt": "2026-05-04T18:30:00+09:00",
  "isOffseason": true,
  "nextSeason": "2026",
  "nextOpensAt": null
}
```

### GET /api/app/version?platform=ios

→ **200** · 운영

```json
{
  "platform": "ios",
  "latestVersion": "1.0.1",
  "minVersion": null,
  "storeUrl": "https://apps.apple.com/kr/app/id6757665858",
  "notes": null
}
```

### GET /api/app/version?platform=android

→ **404** · 운영

값을 아직 설정하지 않은 플랫폼 → **404** (안내를 띄우지 않으면 됨)

```json
{
  "message": "android 버전 정보가 아직 설정되지 않았어요",
  "error": "Not Found",
  "statusCode": 404
}
```

### 승부예측

### GET /api/prediction/week?season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

비시즌이라 시작 전 경기가 없어 `games: []`. 경기가 있을 때 한 항목의 모양은 아래 "week 항목 모양" 참고

```json
{
  "season": "2025",
  "games": []
}
```

### GET /api/prediction/leaderboard?season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "scope": "all",
  "minSettled": 10,
  "total": 4,
  "rows": [
    {
      "rank": 1,
      "nickname": "피벗왕",
      "teamNum": 132,
      "teamName": "SK호크스",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_132.png",
      "settled": 15,
      "hits": 12,
      "rate": 80,
      "isMe": false
    },
    {
      "rank": 2,
      "nickname": "날쌘피벗12",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 12,
      "hits": 9,
      "rate": 75,
      "isMe": true
    },
    {
      "rank": 3,
      "nickname": "골키퍼짱",
      "teamNum": 149,
      "teamName": "두산",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_149.png",
      "settled": 10,
      "hits": 7,
      "rate": 70,
      "isMe": false
    },
    {
      "rank": 4,
      "nickname": "슈가사랑",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 11,
      "hits": 6,
      "rate": 54.5,
      "isMe": false
    }
  ],
  "me": {
    "rank": 2,
    "nickname": "날쌘피벗12",
    "teamNum": 123,
    "teamName": "SK슈가글라이더즈",
    "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
    "settled": 12,
    "hits": 9,
    "rate": 75,
    "isMe": true
  },
  "meHint": null,
  "meTopPercent": 50
}
```

### GET /api/prediction/leaderboard?season=2025&scope=team&teamNum=123

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

팀 범위: rank는 팀 안 순위, `meTopPercent`는 **전체 기준**

```json
{
  "season": "2025",
  "scope": "team",
  "minSettled": 10,
  "total": 2,
  "rows": [
    {
      "rank": 1,
      "nickname": "날쌘피벗12",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 12,
      "hits": 9,
      "rate": 75,
      "isMe": true
    },
    {
      "rank": 2,
      "nickname": "슈가사랑",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 11,
      "hits": 6,
      "rate": 54.5,
      "isMe": false
    }
  ],
  "me": {
    "rank": 1,
    "nickname": "날쌘피벗12",
    "teamNum": 123,
    "teamName": "SK슈가글라이더즈",
    "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
    "settled": 12,
    "hits": 9,
    "rate": 75,
    "isMe": true
  },
  "meHint": null,
  "meTopPercent": 50
}
```

### GET /api/prediction/leaderboard?season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: docsample-0000-0000-0000-00000000000z)

프로필이 없는 기기

```json
{
  "season": "2025",
  "scope": "all",
  "minSettled": 10,
  "total": 4,
  "rows": [
    {
      "rank": 1,
      "nickname": "피벗왕",
      "teamNum": 132,
      "teamName": "SK호크스",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_132.png",
      "settled": 15,
      "hits": 12,
      "rate": 80,
      "isMe": false
    },
    {
      "rank": 2,
      "nickname": "날쌘피벗12",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 12,
      "hits": 9,
      "rate": 75,
      "isMe": false
    },
    {
      "rank": 3,
      "nickname": "골키퍼짱",
      "teamNum": 149,
      "teamName": "두산",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_149.png",
      "settled": 10,
      "hits": 7,
      "rate": 70,
      "isMe": false
    },
    {
      "rank": 4,
      "nickname": "슈가사랑",
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "settled": 11,
      "hits": 6,
      "rate": 54.5,
      "isMe": false
    }
  ],
  "me": null,
  "meHint": "닉네임을 정하면 랭킹에 참여할 수 있어요",
  "meTopPercent": null
}
```

### GET /api/prediction/fandom?gender=M&season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "gender": "M",
  "items": [
    {
      "rank": 1,
      "teamNum": 132,
      "teamName": "SK호크스",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_132.png",
      "fans": 1,
      "settled": 15,
      "hits": 12,
      "rate": 80
    },
    {
      "rank": 2,
      "teamNum": 149,
      "teamName": "두산",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_149.png",
      "fans": 1,
      "settled": 10,
      "hits": 7,
      "rate": 70
    },
    {
      "rank": 3,
      "teamNum": 22,
      "teamName": "상무피닉스",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_22.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 4,
      "teamNum": 113,
      "teamName": "충남도청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_113.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 5,
      "teamNum": 120,
      "teamName": "인천도시공사",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_120.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 6,
      "teamNum": 150,
      "teamName": "하남시청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_m_150.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    }
  ]
}
```

### GET /api/prediction/fandom?gender=W&season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "gender": "W",
  "items": [
    {
      "rank": 1,
      "teamNum": 123,
      "teamName": "SK슈가글라이더즈",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_123.png",
      "fans": 2,
      "settled": 23,
      "hits": 15,
      "rate": 65.2
    },
    {
      "rank": 2,
      "teamNum": 23,
      "teamName": "대구광역시청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_23.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 3,
      "teamNum": 93,
      "teamName": "삼척시청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_93.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 4,
      "teamNum": 100,
      "teamName": "부산시설공단",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_100.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 5,
      "teamNum": 102,
      "teamName": "경남개발공사",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_102.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 6,
      "teamNum": 107,
      "teamName": "서울시청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_107.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 7,
      "teamNum": 110,
      "teamName": "광주도시공사",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_110.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    },
    {
      "rank": 8,
      "teamNum": 127,
      "teamName": "인천광역시청",
      "teamLogoUrl": "https://www.koreahandball.com/static/images/logo/logo_w_127.png",
      "fans": 0,
      "settled": 0,
      "hits": 0,
      "rate": 0
    }
  ]
}
```

### GET /api/prediction/my?season=2025&limit=3

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

`count`·`settled`·`hits`·`rate`는 limit와 무관하게 시즌 전체 기준

```json
{
  "season": "2025",
  "count": 12,
  "settled": 12,
  "hits": 9,
  "rate": 75,
  "items": [
    {
      "matchSeq": 2484,
      "homeName": "충남도청",
      "awayName": "SK호크스",
      "startsAt": "2025-11-30T09:10:00.000Z",
      "pick": "home",
      "settled": true,
      "hit": false,
      "scoreText": "16 : 24"
    },
    {
      "matchSeq": 2485,
      "homeName": "인천도시공사",
      "awayName": "상무피닉스",
      "startsAt": "2025-11-30T07:10:00.000Z",
      "pick": "away",
      "settled": true,
      "hit": false,
      "scoreText": "32 : 30"
    },
    {
      "matchSeq": 2486,
      "homeName": "하남시청",
      "awayName": "두산",
      "startsAt": "2025-11-30T03:00:00.000Z",
      "pick": "home",
      "settled": true,
      "hit": false,
      "scoreText": "22 : 25"
    }
  ]
}
```

### 직관 기록

### GET /api/attendance?season=2025

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "season": "2025",
  "items": [
    {
      "matchSeq": 2477,
      "attendedAt": "2026-09-24T12:30:05.678Z"
    },
    {
      "matchSeq": 2476,
      "attendedAt": "2026-09-24T12:30:04.637Z"
    },
    {
      "matchSeq": 5490,
      "attendedAt": "2026-09-24T12:30:03.253Z"
    }
  ]
}
```

### PUT /api/attendance/5490

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

이미 기록한 경기 → 200, 처음 기록 시각 그대로 (멱등)

```json
{
  "matchSeq": 5490,
  "attendedAt": "2026-09-24T12:30:03.253Z"
}
```

### DELETE /api/attendance/2477

→ **204** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

→ 204, 본문 없음 (없어도 204)

```json
(본문 없음)
```

### 가이드 진행도·관심 선수

### GET /api/progress/guide

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "doneCount": 5,
  "completedAt": "2026-09-24T12:30:07.770Z"
}
```

### PUT /api/progress/guide

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

본문 `{"doneCount":3}` — 서버에 5가 있으면 **5 유지**

```json
{
  "doneCount": 5,
  "completedAt": "2026-09-24T12:30:07.770Z"
}
```

### GET /api/favorites/players

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "items": [
    {
      "playerSeq": 1153,
      "addedAt": "2026-09-24T12:30:07.754Z"
    },
    {
      "playerSeq": 69,
      "addedAt": "2026-09-24T12:30:06.703Z"
    }
  ]
}
```

### PUT /api/favorites/players/69

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

이미 있으면 처음 추가 시각 그대로 (멱등)

```json
{
  "playerSeq": 69,
  "addedAt": "2026-09-24T12:30:06.703Z"
}
```

### DELETE /api/favorites/players/1153

→ **204** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

→ 204

```json
(본문 없음)
```

### 응원글·신고·차단

### GET /api/team/123/cheer?gender=W

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

`authorId` 추가. 내가 차단한 작성자의 글은 빠진다 (total도 제외된 수)

```json
{
  "teamNum": 123,
  "total": 2,
  "page": 1,
  "items": [
    {
      "id": 3,
      "authorId": "6f28e568d8dd6bba",
      "text": "내가 쓴 응원글",
      "likes": 0,
      "liked": false,
      "isMine": true,
      "createdAt": "2026-09-24T12:30:10.258Z"
    },
    {
      "id": 1,
      "authorId": "6deb79a0ecfb72dc",
      "text": "오늘도 SK슈가 화이팅!",
      "likes": 0,
      "liked": false,
      "isMine": false,
      "createdAt": "2026-09-24T12:30:08.179Z"
    }
  ]
}
```

### POST /api/team/123/cheer/3/report

→ **201** · 로컬(운영과 같은 코드)  (X-Device-Id: docsample-0000-0000-0000-00000000000c)

본문 `{"reason":"spam"}` (detail은 선택, 200자까지) → **201**

```json
{
  "reported": true
}
```

### GET /api/block

→ **200** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

```json
{
  "items": [
    {
      "authorId": "ee46e875b6f98dbc",
      "createdAt": "2026-09-24T12:30:10.270Z"
    }
  ]
}
```

### POST /api/block

→ **201** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

이미 차단했어도 201 (멱등)

```json
{
  "authorId": "ee46e875b6f98dbc",
  "createdAt": "2026-09-24T12:30:10.270Z"
}
```

## 3. 오류 응답

### PUT /api/profile

→ **409** · 로컬(운영과 같은 코드)  (X-Device-Id: docsample-0000-0000-0000-00000000000d)

닉네임 중복 (대소문자·공백 무시 비교)

```json
{
  "message": "이미 사용 중인 닉네임이에요",
  "error": "Conflict",
  "statusCode": 409
}
```

### PUT /api/profile

→ **400** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

1자

```json
{
  "message": "닉네임은 2자 이상이어야 해요",
  "error": "Bad Request",
  "statusCode": 400
}
```

### PUT /api/profile

→ **400** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

공백

```json
{
  "message": "닉네임에는 한글, 영문, 숫자만 쓸 수 있어요 (공백·특수문자·이모지 불가)",
  "error": "Bad Request",
  "statusCode": 400
}
```

### PUT /api/profile

→ **404** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

응원팀과 부가 안 맞음

```json
{
  "message": "팀을 찾을 수 없습니다: 123",
  "error": "Not Found",
  "statusCode": 404
}
```

### POST /api/team/123/cheer/3/report

→ **409** · 로컬(운영과 같은 코드)  (X-Device-Id: docsample-0000-0000-0000-00000000000c)

같은 글 두 번 신고

```json
{
  "message": "이미 신고한 글이에요",
  "error": "Conflict",
  "statusCode": 409
}
```

### POST /api/game/5490/prediction

→ **409** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

시작한(끝난) 경기에 예측

```json
{
  "message": "경기가 시작돼 예측할 수 없습니다",
  "error": "Conflict",
  "statusCode": 409
}
```

### GET /api/prediction/my?season=2025

→ **400** · 로컬(운영과 같은 코드)

X-Device-Id 헤더 없음 (쓰기·내 정보 조회 전부 동일)

```json
{
  "message": "X-Device-Id 헤더가 필요합니다 (영문·숫자·하이픈 8~64자)",
  "error": "Bad Request",
  "statusCode": 400
}
```

### POST /api/block

→ **201** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

형식은 맞지만 존재 여부는 검사하지 않아 201. 내 authorId를 넣으면 400 (아래)

```json
{
  "authorId": "0000000000000000",
  "createdAt": "2026-09-24T12:30:49.025Z"
}
```
### POST /api/block

→ **400** · 로컬(운영과 같은 코드)  (X-Device-Id: 11111111-2222-3333-4444-555555555555)

나를 차단 (내 authorId)

```json
{
  "message": "나를 차단할 수는 없어요",
  "error": "Bad Request",
  "statusCode": 400
}
```

### week 항목 모양 (경기가 있을 때)

비시즌이라 실제 항목을 찍지 못했다. `src/prediction/types.ts` 그대로:

```ts
interface PredictionWeekGame {
  matchSeq: number;
  gender: "M" | "W";
  homeName: string;          // /api/team 정본 이름
  awayName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  startsAt: string;          // "2026-11-14T14:00:00+09:00"
  venue: string | null;
  open: boolean;             // 시작 전이면 true (이 목록은 시작 전 경기만 담는다)
  myPick: "home" | "draw" | "away" | null;
  total: number;
  home: number;
  draw: number;
  away: number;
}
```

## 4. 경기장 이름 (운영, 2025 시즌)

**일관돼 있다. 앱은 `venue` 문자열을 그대로 키로 써도 된다.** 2023~2025 세 시즌 약 500경기에서도 공백·접두어 변형은 없었다.
`인천선학체육관`과 `인천남동체육관`(2023~24)은 실제로 다른 경기장이다. 구단별 홈구장 정보는 원본에 없다.

```
[남자부]
부산 기장체육관
삼척 시민체육관
인천선학체육관
청주 SK호크스아레나
티켓링크 라이브 아레나(핸드볼경기장)

[여자부]
광명 시민체육관
광주 빛고을체육관
부산 기장체육관
삼척 시민체육관
청주 SK호크스아레나
티켓링크 라이브 아레나(핸드볼경기장)
```

## 5. 집 안(같은 공유기)에서 붙는 방법

공유기가 NAT 루프백을 지원하지 않아 집 안에서는 도메인으로 서버에 닿지 않는다. 둘 중 하나를 쓴다.

**(a) 집 안 전용 HTTP 입구 — 가장 간단**

```
http://192.168.55.4:8080/api/...
```

- 운영 서버 그대로다 (같은 DB). 라우팅(`/api`, `/privacy`, `/terms`)도 같다. 인증서 없는 HTTP
- 앱을 붙일 때: `flutter run --dart-define=API_BASE_URL=http://192.168.55.4:8080`
- 공유기에서 포워딩하지 않아 외부에는 열려 있지 않다

**(b) curl로 HTTPS 그대로** — 도메인 이름에 IP를 지정한다

```bash
curl --resolve myhandball.lab241.com:443:192.168.55.4 https://myhandball.lab241.com/api/health
```

## 6. 26-27 시즌 개막일

**아직 없다 (`nextOpensAt: null`).** 연맹이 발표하지 않았고, 서버는 날짜를 추정해서 넣지 않는다.
발표되면 운영 `deploy/.env`에 `SEASON_OPENS_AT_M="2026=<ISO 시각>"`(여자부 `_W`)을 넣는다.
2026-27 일정이 연맹 사이트에 올라오면 첫 경기 시각이 자동으로 들어간다. 그전까지 앱은 "11월"처럼 달만 보여 주면 된다.
