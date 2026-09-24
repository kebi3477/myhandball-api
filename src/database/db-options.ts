import { join } from "path";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

/**
 * 앱(AppModule)과 마이그레이션 CLI(data-source.ts)가 같이 쓰는 접속 설정.
 *
 * **스키마는 마이그레이션으로만 바꾼다** (`synchronize: false`). 엔티티를 고치면
 * `npm run migration:generate -- src/migrations/<이름>` → 생성된 SQL 검토 → 커밋 → 배포.
 * 서버는 기동할 때 아직 적용하지 않은 마이그레이션을 실행한다 (`migrationsRun`).
 */
export function dbOptions(): PostgresConnectionOptions {
  return {
    type: "postgres",
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    synchronize: false,
    // 컴파일된 dist/migrations/*.js (이 파일은 dist/database/에 있다)
    migrations: [join(__dirname, "..", "migrations", "*.js")],
    migrationsTableName: "migrations",
  };
}
