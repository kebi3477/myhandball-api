import "dotenv/config";
import { join } from "path";
import { DataSource } from "typeorm";
import { dbOptions } from "./database/db-options";

/**
 * TypeORM CLI용 (마이그레이션 생성·실행·확인). 컴파일된 dist/data-source.js를 쓴다.
 *   npm run migration:show / migration:run / migration:generate -- src/migrations/<이름>
 * 앱은 AppModule에서 같은 dbOptions()로 접속한다
 */
export default new DataSource({
  ...dbOptions(),
  entities: [join(__dirname, "**", "*.entity.js")],
});
