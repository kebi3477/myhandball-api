import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";

export interface ReportedCheer {
  id: number;
  teamNum: number;
  gender: string;
  text: string;
  likes: number;
  hidden: boolean;
  authorId: string | null;
  createdAt: string;
  reports: number;
  reasons: Record<string, number>;
  details: string[];
  lastReportAt: string | null;
}

/** 응원글 신고 처리: 신고됐거나 숨겨진 글 목록, 숨김·복원, 삭제(좋아요·신고 함께) */
@Injectable()
export class ModerationService {
  constructor(private readonly dataSource: DataSource) {}

  async reported(): Promise<ReportedCheer[]> {
    const rows: {
      id: number;
      team_num: number;
      gender: string;
      text: string;
      likes: number;
      hidden: boolean;
      author_id: string | null;
      created_at: Date;
      reports: number;
      reasons: string[] | null;
      details: (string | null)[] | null;
      last_report_at: Date | null;
    }[] = await this.dataSource.query(
      `SELECT c.id, c.team_num, c.gender, c.text, c.likes, c.hidden, c.author_id, c.created_at,
              COUNT(r.id)::int AS reports,
              ARRAY_AGG(r.reason) FILTER (WHERE r.id IS NOT NULL) AS reasons,
              ARRAY_AGG(r.detail) FILTER (WHERE r.detail IS NOT NULL) AS details,
              MAX(r.created_at) AS last_report_at
         FROM cheers c LEFT JOIN cheer_reports r ON r.cheer_id = c.id
        GROUP BY c.id
       HAVING COUNT(r.id) > 0 OR c.hidden
        ORDER BY c.hidden DESC, MAX(r.created_at) DESC NULLS LAST, c.id DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({
      id: r.id,
      teamNum: r.team_num,
      gender: r.gender,
      text: r.text,
      likes: r.likes,
      hidden: r.hidden,
      authorId: r.author_id,
      createdAt: new Date(r.created_at).toISOString(),
      reports: r.reports,
      reasons: (r.reasons ?? []).reduce<Record<string, number>>((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {}),
      details: (r.details ?? []).filter((d): d is string => !!d),
      lastReportAt: r.last_report_at ? new Date(r.last_report_at).toISOString() : null,
    }));
  }

  /**
   * 숨김/복원. 복원할 때는 신고 기록을 지운다 — 남겨 두면 다음 신고 한 건에 바로 다시 자동 숨김된다
   */
  async setHidden(id: number, hidden: boolean) {
    return this.dataSource.transaction(async (em) => {
      const res = await em.query(`UPDATE cheers SET hidden = $2 WHERE id = $1`, [id, hidden]);
      if (!res[1]) throw new NotFoundException("응원글이 없습니다");
      if (!hidden) await em.query(`DELETE FROM cheer_reports WHERE cheer_id = $1`, [id]);
      return { id, hidden };
    });
  }

  async remove(id: number) {
    return this.dataSource.transaction(async (em) => {
      await em.query(`DELETE FROM cheer_likes WHERE cheer_id = $1`, [id]);
      await em.query(`DELETE FROM cheer_reports WHERE cheer_id = $1`, [id]);
      const res = await em.query(`DELETE FROM cheers WHERE id = $1`, [id]);
      if (!res[1]) throw new NotFoundException("응원글이 없습니다");
      return { deleted: true };
    });
  }
}
