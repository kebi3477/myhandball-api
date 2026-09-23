# syntax=docker/dockerfile:1

FROM node:20-bullseye AS build
ENV PNPM_HOME="/usr/local/share/.pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# 먼저 의존성 메타데이터만 복사하여 캐시 효과를 높임
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

# 나머지 소스를 복사하고 빌드
COPY . .
RUN pnpm --filter @koha/api build

# 런타임에 필요한 노드 모듈만 남김
RUN pnpm prune --prod

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 3000

CMD ["node", "apps/api/dist/main"]
