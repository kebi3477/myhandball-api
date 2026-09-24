import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * v1 웹 온보딩 설문(welcome_submissions: 성별·연령대·마이팀) 테이블 삭제.
 * v1 웹이 2026-09 SSL 만료로 멈췄고, Flutter 앱은 이 값을 서버로 보내지 않는다 (기기에만 둔다).
 * 쓰는 곳이 없는 개인정보라 지운다 (2026-09-24 결정). 삭제 전 데이터는 매일 백업(최대 14일)에 남아 있다.
 * 엔티티가 없는 테이블은 migration:generate가 잡지 않아서 직접 작성했다
 */
export class DropWelcomeSubmissions1790261800380 implements MigrationInterface {
    name = 'DropWelcomeSubmissions1790261800380'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "welcome_submissions"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 테이블 구조만 되살린다 (데이터는 백업에서 복원)
        await queryRunner.query(`CREATE TABLE "welcome_submissions" ("id" SERIAL NOT NULL, "user_gender" text NOT NULL, "age_group" text NOT NULL, "team_gender" text NOT NULL, "team_num" integer, "team_name" text, "team_logo_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a768e0cda87a1d3262f68f2362b" PRIMARY KEY ("id"))`);
    }
}
