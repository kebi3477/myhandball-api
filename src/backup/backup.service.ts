import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createReadStream, promises as fs } from "fs";
import { join } from "path";
import { promisify } from "util";
import { gunzip, gzip } from "zlib";
import { DataSource } from "typeorm";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const BACKUP_FILE_RE = /^myhandball-\d{8}-\d{6}\.json\.gz$/;
const MIGRATIONS_TABLE = "migrations";

export interface BackupFileInfo {
  file: string;
  size: number;
  createdAt: string;
}

/** 백업 파일 내용 (JSON, gzip) */
export interface BackupDocument {
  format: "myhandball-backup";
  version: 1;
  createdAt: string;
  /** 백업 시점에 적용돼 있던 마지막 마이그레이션. 복원은 같은 스키마에서만 한다 */
  lastMigration: string | null;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * 모든 테이블을 JSON으로 떠서 gzip으로 저장하는 논리 백업.
 * API 컨테이너에 pg_dump가 없어서 API가 직접 한다 (데이터가 작아 충분하다).
 * - 매일 04:00 KST 자동, BACKUP_KEEP개(기본 14)만 남긴다
 * - 파일은 BACKUP_DIR (도커에서는 호스트의 deploy/backups에 마운트)
 * - 복원: node dist/scripts/restore-backup.js <파일> --yes
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  get dir(): string {
    return process.env.BACKUP_DIR?.trim() || join(process.cwd(), "backups");
  }

  private get keep(): number {
    const n = Number(process.env.BACKUP_KEEP);
    return Number.isInteger(n) && n > 0 ? n : 14;
  }

  @Cron("0 4 * * *", { timeZone: "Asia/Seoul" })
  async scheduled() {
    if (process.env.BACKUP_ENABLED === "false") return;
    try {
      await this.backupNow();
    } catch (e) {
      this.logger.error(`정기 백업 실패: ${e}`);
    }
  }

  /** 백업 대상 테이블: 엔티티 테이블 전부 + migrations */
  tableNames(): string[] {
    const names = this.dataSource.entityMetadatas.map((m) => m.tableName);
    return [...new Set([...names, MIGRATIONS_TABLE])].sort();
  }

  async backupNow(): Promise<BackupFileInfo> {
    if (this.running) throw new Error("백업이 이미 진행 중입니다");
    this.running = true;
    try {
      const doc = await this.dump();
      const now = new Date();
      const stamp = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const file = `myhandball-${stamp.slice(0, 8)}-${stamp.slice(8)}.json.gz`;
      await fs.mkdir(this.dir, { recursive: true });
      const body = await gzipAsync(Buffer.from(JSON.stringify(doc)));
      await fs.writeFile(join(this.dir, file), body);
      const rows = Object.values(doc.tables).reduce((s, t) => s + t.length, 0);
      this.logger.log(`백업 완료: ${file} (${(body.length / 1024).toFixed(1)}KB, ${rows}행)`);
      await this.prune();
      const stat = await fs.stat(join(this.dir, file));
      return { file, size: stat.size, createdAt: doc.createdAt };
    } finally {
      this.running = false;
    }
  }

  /** 한 트랜잭션(REPEATABLE READ) 안에서 모든 테이블을 읽어 시점이 어긋나지 않게 한다 */
  private async dump(): Promise<BackupDocument> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction("REPEATABLE READ");
      const tables: BackupDocument["tables"] = {};
      for (const t of this.tableNames()) {
        if (!(await qr.hasTable(t))) continue;
        tables[t] = await qr.query(`SELECT * FROM "${t}"`);
      }
      const last: { name: string }[] = tables[MIGRATIONS_TABLE]?.length
        ? await qr.query(`SELECT name FROM "${MIGRATIONS_TABLE}" ORDER BY id DESC LIMIT 1`)
        : [];
      await qr.commitTransaction();
      return {
        format: "myhandball-backup",
        version: 1,
        createdAt: new Date().toISOString(),
        lastMigration: last[0]?.name ?? null,
        tables,
      };
    } catch (e) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async list(): Promise<BackupFileInfo[]> {
    let files: string[] = [];
    try {
      files = (await fs.readdir(this.dir)).filter((f) => BACKUP_FILE_RE.test(f));
    } catch {
      return [];
    }
    const out: BackupFileInfo[] = [];
    for (const f of files) {
      const st = await fs.stat(join(this.dir, f));
      out.push({ file: f, size: st.size, createdAt: st.mtime.toISOString() });
    }
    return out.sort((a, b) => b.file.localeCompare(a.file));
  }

  private async prune() {
    const files = await this.list();
    for (const f of files.slice(this.keep)) {
      await fs.unlink(join(this.dir, f.file));
      this.logger.log(`오래된 백업 삭제: ${f.file}`);
    }
  }

  /** 다운로드용. 파일 이름은 형식을 검사해 경로 조작을 막는다 */
  openFile(file: string) {
    if (!BACKUP_FILE_RE.test(file)) throw new Error("잘못된 백업 파일 이름");
    return createReadStream(join(this.dir, file));
  }

  static async readFile(path: string): Promise<BackupDocument> {
    const doc = JSON.parse((await gunzipAsync(await fs.readFile(path))).toString("utf8")) as BackupDocument;
    if (doc.format !== "myhandball-backup" || doc.version !== 1) throw new Error("마이핸드볼 백업 파일이 아닙니다");
    return doc;
  }

  /**
   * 백업으로 DB 내용을 통째로 바꾼다. 스키마(마지막 마이그레이션)가 같을 때만.
   * 한 트랜잭션: 모든 테이블 비우기 → 행 넣기 → 자동 증가 번호 맞추기. 실패하면 아무것도 바뀌지 않는다
   */
  static async restore(dataSource: DataSource, doc: BackupDocument, log: (m: string) => void = console.log) {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      const last: { name: string }[] = (await qr.hasTable(MIGRATIONS_TABLE))
        ? await qr.query(`SELECT name FROM "${MIGRATIONS_TABLE}" ORDER BY id DESC LIMIT 1`)
        : [];
      const current = last[0]?.name ?? null;
      if (current !== doc.lastMigration) {
        throw new Error(`스키마가 다릅니다. 현재 마지막 마이그레이션 ${current}, 백업 ${doc.lastMigration}`);
      }
      const tables = Object.keys(doc.tables).filter((t) => t !== MIGRATIONS_TABLE);
      // 파일에 적힌 이름으로 SQL을 만드므로, 실제 엔티티 테이블과 정상적인 컬럼 이름만 받는다
      const known = new Set(dataSource.entityMetadatas.map((m) => m.tableName));
      const IDENT = /^[a-z_][a-z0-9_]*$/;
      for (const t of tables) {
        if (!known.has(t)) throw new Error(`알 수 없는 테이블: ${t}`);
        for (const c of new Set(doc.tables[t].flatMap((r) => Object.keys(r)))) {
          if (!IDENT.test(c)) throw new Error(`잘못된 컬럼 이름: ${t}.${c}`);
        }
      }
      await qr.startTransaction();
      await qr.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
      for (const t of tables) {
        const rows = doc.tables[t];
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          if (!chunk.length) continue;
          const params: unknown[] = [];
          const tuples = chunk.map(
            (r) => `(${cols.map((c) => (params.push(r[c] ?? null), `$${params.length}`)).join(", ")})`,
          );
          await qr.query(
            `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
            params,
          );
        }
        // 자동 증가(SERIAL) 기본키의 다음 번호를 복원한 최댓값 뒤로 맞춘다. 문자열·수동 기본키 테이블은 건너뛴다
        const meta = dataSource.entityMetadatas.find((m) => m.tableName === t)!;
        for (const col of meta.primaryColumns.filter((c) => c.isGenerated && c.generationStrategy === "increment")) {
          const c = col.databaseName;
          const seq: { seq: string | null }[] = await qr.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [`"${t}"`, c]);
          if (seq[0]?.seq) {
            await qr.query(`SELECT setval($1, COALESCE((SELECT MAX("${c}") FROM "${t}"), 1), (SELECT COUNT(*) > 0 FROM "${t}"))`, [seq[0].seq]);
          }
        }
        log(`  ${t}: ${rows.length}행`);
      }
      await qr.commitTransaction();
    } catch (e) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
