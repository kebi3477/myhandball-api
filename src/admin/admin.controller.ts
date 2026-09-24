import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { BACKUP_FILE_RE, BackupService } from "../backup/backup.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminTablesService } from "./admin-tables.service";
import { ADMIN_PAGE_HTML } from "./admin.page";
import { ModerationService } from "./moderation.service";

/**
 * 관리자 페이지: GET /api/admin (화면), /api/admin/api/* (데이터, ADMIN_TOKEN 필요).
 * ADMIN_TOKEN이 없으면 전부 404 (관리자 기능 꺼짐)
 */
// ADMIN_TOKEN이 없을 때 보여 줄 안내 (빈 화면 대신 무엇을 설정해야 하는지 알린다)
const ADMIN_DISABLED_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>관리자 기능 꺼짐</title><style>body{font:15px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;max-width:560px;margin:12vh auto;padding:0 16px}
code{background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px}</style></head><body>
<h2>관리자 기능이 꺼져 있습니다</h2>
<p>서버 환경변수 <code>ADMIN_TOKEN</code>이 없거나 24자보다 짧습니다.</p>
<ol><li><code>.env</code>(도커는 <code>deploy/.env</code>)에 <code>ADMIN_TOKEN=</code> 긴 난수를 넣습니다.<br>예: <code>openssl rand -hex 32</code></li>
<li>서버를 다시 시작합니다. (<code>.env</code>는 시작할 때만 읽습니다)</li></ol></body></html>`;

@Controller("admin")
export class AdminPageController {
  @Get()
  page(@Res() res: Response): void {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    const enabled = (process.env.ADMIN_TOKEN?.trim() ?? "").length >= 24;
    res.status(enabled ? 200 : 404).type("html").send(enabled ? ADMIN_PAGE_HTML : ADMIN_DISABLED_HTML);
  }
}

@Controller("admin/api")
@UseGuards(AdminAuthGuard)
export class AdminApiController {
  constructor(
    private readonly tables: AdminTablesService,
    private readonly moderation: ModerationService,
    private readonly backups: BackupService,
  ) {}

  /** 토큰 확인용 */
  @Get("me")
  me() {
    return { ok: true };
  }

  // ---------- 테이블 ----------

  @Get("tables")
  listTables() {
    return this.tables.tables();
  }

  @Get("tables/:name")
  rows(
    @Param("name") name: string,
    @Query("page") page = "1",
    @Query("size") size = "50",
    @Query("q") q?: string,
  ) {
    const p = Number(page);
    const s = Number(size);
    if (!Number.isInteger(p) || p < 1 || !Number.isInteger(s) || s < 1 || s > 200) {
      throw new BadRequestException("page는 1 이상, size는 1~200");
    }
    return this.tables.rows(name, p, s, q?.trim() || undefined);
  }

  @Patch("tables/:name/:id")
  update(@Param("name") name: string, @Param("id") id: string, @Body() body: { values?: Record<string, unknown> }) {
    return this.tables.update(name, id, body?.values ?? {});
  }

  @Delete("tables/:name/:id")
  remove(@Param("name") name: string, @Param("id") id: string) {
    return this.tables.remove(name, id);
  }

  // ---------- 신고된 응원글 ----------

  @Get("reports")
  reported() {
    return this.moderation.reported();
  }

  @Post("cheers/:id/hide")
  @HttpCode(200)
  hide(@Param("id", ParseIntPipe) id: number) {
    return this.moderation.setHidden(id, true);
  }

  @Post("cheers/:id/unhide")
  @HttpCode(200)
  unhide(@Param("id", ParseIntPipe) id: number) {
    return this.moderation.setHidden(id, false);
  }

  @Delete("cheers/:id")
  removeCheer(@Param("id", ParseIntPipe) id: number) {
    return this.moderation.remove(id);
  }

  // ---------- 백업 ----------

  @Get("backups")
  listBackups() {
    return this.backups.list().then((files) => ({ dir: this.backups.dir, files }));
  }

  @Post("backups")
  backupNow() {
    return this.backups.backupNow();
  }

  @Get("backups/:file")
  download(@Param("file") file: string, @Res() res: Response) {
    if (!BACKUP_FILE_RE.test(file)) throw new BadRequestException("잘못된 파일 이름");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    const stream = this.backups.openFile(file);
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).json({ statusCode: 404, message: "파일이 없습니다" });
      else res.end();
    });
    stream.pipe(res);
  }
}
