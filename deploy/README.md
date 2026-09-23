# 미니 PC 배포

API, Postgres, Redis, Caddy(HTTPS)를 도커 컨테이너 네 개로 띄웁니다.
Caddy가 `myhandball.kro.kr` 인증서를 자동으로 받고 갱신합니다(무료).

```
인터넷 ──443/80──▶ 공유기 ──▶ 미니 PC
                               └ caddy ──▶ api:3000 ──▶ postgres, redis
```

## 처음 한 번

### 1. 미니 PC 준비

- Docker Engine과 Compose 플러그인을 설치합니다. Ubuntu 기준:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # 다시 로그인하면 sudo 없이 docker 사용
  docker compose version          # v2 이상인지 확인
  ```
- 80, 443 포트를 다른 프로그램(nginx, apache 등)이 쓰고 있지 않은지 확인합니다.
  ```bash
  sudo ss -ltnp | grep -E ':(80|443)\b'   # 아무것도 안 나와야 한다
  ```
- 잠자기, 절전이 꺼져 있어야 합니다.

### 2. 공유기

- **포트포워딩**: 외부 `443/TCP` → 미니 PC IP `443`. 가능하면 `80/TCP` → `80`도 추가합니다.
  지금 공인 IP의 80번에는 공유기 관리자 로그인 페이지가 응답합니다. 원격 관리가 켜져 있으면
  끄거나 포트를 옮깁니다. 80을 못 열어도 443만으로 인증서가 발급됩니다
- **DHCP 고정 할당**: 미니 PC의 내부 IP가 바뀌지 않게 MAC 주소를 묶어 둡니다
- `myhandball.kro.kr`(내도메인.한국)이 집 공인 IP를 가리키는지 확인합니다.
  공인 IP가 바뀌면 거기서 다시 맞춰야 합니다

### 3. 코드와 설정

```bash
git clone https://github.com/kebi3477/myhandball-api.git
cd myhandball-api/deploy
cp .env.example .env
nano .env
```

`.env`에서 최소한 채울 값:

| 키 | 값 |
|---|---|
| `POSTGRES_PASSWORD` | 긴 난수 (`openssl rand -hex 24`). **처음 정한 뒤 바꾸지 않는다** |
| `ACME_EMAIL` | 인증서 계정 이메일. Let's Encrypt가 `kro.kr` 공용 한도에 걸리면 ZeroSSL로 넘어갈 때 필요 |
| `CURRENT_SEASON` | `2025` (25-26 시즌). 새 시즌 일정이 나오면 바꾼다 |

### 4. 실행

```bash
docker compose up -d --build
docker compose ps                 # 네 개 모두 running / healthy
docker compose logs -f caddy      # "certificate obtained successfully"가 나오면 인증서 발급 완료
```

### 5. 확인

**휴대폰의 Wi-Fi를 끄고 LTE로** 접속해야 합니다. 집 Wi-Fi에서는 공유기 안쪽이라 제대로 확인되지 않습니다.

```
https://myhandball.kro.kr/api/health
https://myhandball.kro.kr/api/schedule?gender=M&season=2025&type=1
```

미니 PC 안에서 인증서 없이 API만 볼 때:

```bash
docker compose exec api node -e "fetch('http://localhost:3000/api/health').then(r=>r.text()).then(console.log)"
```

## 운영

| 할 일 | 명령 |
|---|---|
| 코드 업데이트 | `git pull && docker compose up -d --build api` |
| 로그 | `docker compose logs -f api` (폴러, 푸시 드라이런 로그도 여기 나온다) |
| 재시작 | `docker compose restart api` |
| 전체 중지 | `docker compose down` (데이터는 볼륨에 남는다) |
| DB 백업 | `docker compose exec postgres pg_dump -U myhandball myhandball > backup-$(date +%F).sql` |
| DB 접속 | `docker compose exec postgres psql -U myhandball myhandball` |

- **`docker compose down -v`는 쓰지 마세요.** 볼륨까지 지워서 DB(예측·투표·응원글·푸시 토큰)와
  인증서가 사라집니다. 인증서를 다시 받다가 발급 한도에 걸릴 수 있습니다
- DB 스키마는 API가 기동할 때 엔티티에 맞춰 자동으로 바뀝니다(`synchronize: true`).
  운영 데이터가 쌓이면 마이그레이션으로 바꿔야 합니다 (`docs/api-tasks/07-후속-작업.md` B-4)
- 폴러(경기 중 PBP 폴링)는 **API 컨테이너 하나에서만** 돌아야 합니다. `api`를 여러 개로 늘리지 마세요

## 인증서가 안 나올 때

`docker compose logs caddy`에서 원인을 봅니다.

| 로그 | 원인 |
|---|---|
| `rateLimited ... "kro.kr"` | Let's Encrypt 공용 한도. `ACME_EMAIL`이 있으면 ZeroSSL로 자동 재시도한다 |
| `timeout`, `connection refused`, `Timeout during connect` | 공유기 포트포워딩이 안 됐거나 미니 PC 방화벽(`ufw`)이 막고 있다 |
| `NXDOMAIN`, IP 불일치 | 도메인이 집 공인 IP를 가리키지 않는다 |

설정을 고친 뒤 `docker compose restart caddy`로 바로 다시 시도합니다.
