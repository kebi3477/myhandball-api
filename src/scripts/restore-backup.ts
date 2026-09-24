/**
 * 백업 복원 (DB 내용을 백업 시점으로 통째로 바꾼다).
 *   도커: docker compose exec api node dist/scripts/restore-backup.js backups/<파일> --yes
 *   로컬: npm run build && node dist/scripts/restore-backup.js backups/<파일> --yes
 * --yes 없이 실행하면 내용만 보여 주고 끝난다. 복원 전에 현재 상태를 한 번 더 백업해 두는 걸 권한다
 */
import "dotenv/config";
import dataSource from "../data-source";
import { BackupService } from "../backup/backup.service";

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.error("사용법: node dist/scripts/restore-backup.js <백업 파일> [--yes]");
    process.exit(2);
  }
  const doc = await BackupService.readFile(file);
  console.log(`백업 시각 ${doc.createdAt}, 마이그레이션 ${doc.lastMigration}`);
  for (const [t, rows] of Object.entries(doc.tables)) console.log(`  ${t}: ${rows.length}행`);
  if (flag !== "--yes") {
    console.log("\n실제로 복원하려면 --yes 를 붙이세요. (현재 DB 내용이 모두 이 백업으로 바뀝니다)");
    return;
  }
  await dataSource.initialize();
  console.log("\n복원 중...");
  await BackupService.restore(dataSource, doc);
  await dataSource.destroy();
  console.log("복원 완료");
}

main().catch((e) => {
  console.error(`복원 실패: ${e.message ?? e}`);
  process.exit(1);
});
