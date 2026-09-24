import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, EntityMetadata, QueryFailedError } from "typeorm";
import { nicknameError, nicknameKey } from "../profile/nickname";

export interface AdminColumn {
  name: string; // 엔티티 속성 이름 (수정할 때 쓰는 키)
  column: string; // DB 컬럼 이름
  type: string;
  primary: boolean;
  nullable: boolean;
  generated: boolean; // 자동 증가·자동 시각 → 수정 불가
}

export interface AdminTable {
  name: string; // DB 테이블 이름
  count: number;
  columns: AdminColumn[];
}

const TEXT_TYPES = new Set(["text", "varchar", "character varying", String]);

/**
 * 관리자 페이지의 테이블 공통 조회·수정·삭제.
 * 테이블은 TypeORM 엔티티 메타데이터에 있는 것만 다룬다 (입력으로 받은 이름을 SQL에 넣지 않는다)
 */
@Injectable()
export class AdminTablesService {
  constructor(private readonly dataSource: DataSource) {}

  private meta(name: string): EntityMetadata {
    const m = this.dataSource.entityMetadatas.find((x) => x.tableName === name);
    if (!m) throw new NotFoundException(`테이블이 없습니다: ${name}`);
    return m;
  }

  private columns(m: EntityMetadata): AdminColumn[] {
    return m.columns.map((c) => ({
      name: c.propertyName,
      column: c.databaseName,
      type: typeof c.type === "string" ? c.type : (c.type as { name?: string }).name?.toLowerCase() ?? "unknown",
      primary: c.isPrimary,
      nullable: c.isNullable,
      generated: !!c.isGenerated || c.isCreateDate || c.isUpdateDate,
    }));
  }

  async tables(): Promise<AdminTable[]> {
    const out: AdminTable[] = [];
    for (const m of [...this.dataSource.entityMetadatas].sort((a, b) => a.tableName.localeCompare(b.tableName))) {
      out.push({ name: m.tableName, count: await this.dataSource.getRepository(m.target).count(), columns: this.columns(m) });
    }
    return out;
  }

  /** 기본키 내림차순(최근 것 먼저). q가 있으면 문자열 컬럼에서 부분 일치 검색 */
  async rows(name: string, page: number, size: number, q?: string) {
    const m = this.meta(name);
    const pk = m.primaryColumns[0];
    const qb = this.dataSource.getRepository(m.target).createQueryBuilder("t");
    if (q) {
      const textCols = m.columns.filter((c) => TEXT_TYPES.has(c.type as string));
      const intCols = m.columns.filter((c) => c.type === "int" || c.type === Number);
      const conds = textCols.map((c) => `t.${c.databaseName} ILIKE :like`);
      if (/^-?\d+$/.test(q)) conds.push(...intCols.map((c) => `t.${c.databaseName} = :num`));
      if (conds.length) qb.where(`(${conds.join(" OR ")})`, { like: `%${q}%`, num: Number(q) });
    }
    qb.orderBy(`t.${pk.databaseName}`, "DESC").skip((page - 1) * size).take(size);
    const [rows, total] = await qb.getManyAndCount();
    return { table: name, primaryKey: pk.propertyName, page, size, total, rows };
  }

  private pkValue(m: EntityMetadata, raw: string): string | number {
    const pk = m.primaryColumns[0];
    const isInt = pk.type === "int" || pk.type === Number || pk.isGenerated;
    if (!isInt) return raw;
    const n = Number(raw);
    if (!Number.isInteger(n)) throw new BadRequestException("기본키가 숫자가 아닙니다");
    return n;
  }

  /** 값 수정. 기본키·자동 생성 컬럼은 못 바꾼다. profiles.nickname은 규칙 검사 후 중복 키도 같이 바꾼다 */
  async update(name: string, id: string, values: Record<string, unknown>) {
    const m = this.meta(name);
    const cols = new Map(this.columns(m).map((c) => [c.name, c]));
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values ?? {})) {
      const c = cols.get(k);
      if (!c) throw new BadRequestException(`없는 컬럼: ${k}`);
      if (c.primary || c.generated) throw new BadRequestException(`바꿀 수 없는 컬럼: ${k}`);
      if (v === null && !c.nullable) throw new BadRequestException(`null이 될 수 없는 컬럼: ${k}`);
      data[k] = v;
    }
    if (name === "profiles" && "nickname" in data) {
      const err = nicknameError(data.nickname);
      if (err) throw new BadRequestException(err);
      data.nickname = (data.nickname as string).trim();
      data.nicknameKey = nicknameKey(data.nickname as string);
    }
    if (!Object.keys(data).length) throw new BadRequestException("바꿀 값이 없습니다");

    const repo = this.dataSource.getRepository(m.target);
    const where = { [m.primaryColumns[0].propertyName]: this.pkValue(m, id) };
    try {
      const res = await repo.update(where, data);
      if (!res.affected) throw new NotFoundException("행이 없습니다");
    } catch (e) {
      if (e instanceof QueryFailedError && (e as any).driverError?.code === "23505") {
        throw new ConflictException("중복되는 값입니다 (unique 제약)");
      }
      if (e instanceof QueryFailedError) throw new BadRequestException(`DB 오류: ${(e as any).driverError?.message ?? e.message}`);
      throw e;
    }
    return repo.findOneOrFail({ where });
  }

  async remove(name: string, id: string) {
    const m = this.meta(name);
    const repo = this.dataSource.getRepository(m.target);
    const res = await repo.delete({ [m.primaryColumns[0].propertyName]: this.pkValue(m, id) });
    if (!res.affected) throw new NotFoundException("행이 없습니다");
    return { deleted: true };
  }
}
