# syntax=docker/dockerfile:1

FROM node:20-bullseye AS build
WORKDIR /app

# 먼저 의존성 메타데이터만 복사하여 캐시 효과를 높임
COPY package.json package-lock.json ./
RUN npm ci

# 나머지 소스를 복사하고 빌드
COPY . .
RUN npm run build

# 런타임에 필요한 노드 모듈만 남김
RUN npm prune --omit=dev

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
