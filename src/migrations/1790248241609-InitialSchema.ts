import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 기준 마이그레이션: synchronize를 끄기 전의 스키마 전체 (테이블 16개).
 * 새 DB에서는 전부 만들고, 이미 같은 테이블이 다 있는 DB(운영)에서는 건너뛴다
 */
export class InitialSchema1790248241609 implements MigrationInterface {
    name = 'InitialSchema1790248241609'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 운영 DB는 이 마이그레이션 전까지 synchronize(자동 생성)로 같은 엔티티에서 만들어졌다.
        // 테이블이 모두 있으면 구조가 같으므로 SQL을 건너뛰고 "적용됨"으로만 기록한다.
        // 하나도 없으면(새 DB) 전부 만든다. 일부만 있으면 추측하지 않고 멈춘다
        const tables = ["attendances", "blocks", "cheer_likes", "cheer_reports", "cheers", "favorite_players", "guide_progress", "live_events", "match_meta", "match_states", "mvp_votes", "predictions", "profiles", "push_logs", "push_tokens", "welcome_submissions"];
        const existing: string[] = [];
        for (const t of tables) if (await queryRunner.hasTable(t)) existing.push(t);
        if (existing.length === tables.length) {
            console.log(`[InitialSchema] 기존 테이블 ${tables.length}개가 이미 있어 건너뜀 (synchronize로 만든 DB)`);
            return;
        }
        if (existing.length > 0) {
            const missing = tables.filter((t) => !existing.includes(t));
            throw new Error(`[InitialSchema] 테이블이 일부만 있습니다. 있음: ${existing.join(", ")} / 없음: ${missing.join(", ")}`);
        }
        await queryRunner.query(`CREATE TABLE "welcome_submissions" ("id" SERIAL NOT NULL, "user_gender" text NOT NULL, "age_group" text NOT NULL, "team_gender" text NOT NULL, "team_num" integer, "team_name" text, "team_logo_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a768e0cda87a1d3262f68f2362b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "guide_progress" ("device_id" character varying(64) NOT NULL, "done_count" integer NOT NULL DEFAULT '0', "completed_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_add21969b2bc77792472e24683a" PRIMARY KEY ("device_id"))`);
        await queryRunner.query(`CREATE TABLE "favorite_players" ("id" SERIAL NOT NULL, "device_id" character varying(64) NOT NULL, "player_seq" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f7e6fa8db8bda531d3321b17a44" UNIQUE ("device_id", "player_seq"), CONSTRAINT "PK_21bb7e46cf699ca7d4f3decd86b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a706a722abea8397ae180c787d" ON "favorite_players" ("device_id") `);
        await queryRunner.query(`CREATE TABLE "push_tokens" ("id" SERIAL NOT NULL, "device_id" character varying(64) NOT NULL, "token" text NOT NULL, "platform" character varying NOT NULL, "team_num" integer, "gender" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_48827a80fd3279a8d40da03b294" UNIQUE ("device_id"), CONSTRAINT "PK_32734e87f299c29ca3878861f4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cc13ecc6fdf22f09515bd12ead" ON "push_tokens" ("team_num") `);
        await queryRunner.query(`CREATE TABLE "push_logs" ("id" SERIAL NOT NULL, "match_seq" integer NOT NULL, "kind" character varying NOT NULL, "recipients" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_74c6cd65c515baf70e5bd5cc8eb" UNIQUE ("match_seq", "kind"), CONSTRAINT "PK_ddb97dad55005fcdac41f87c33b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "profiles" ("id" SERIAL NOT NULL, "device_id" character varying(64) NOT NULL, "nickname" character varying(40) NOT NULL, "nickname_key" character varying(40) NOT NULL, "team_num" integer NOT NULL, "gender" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_93a9ee433226aa0ebcfc36037d" ON "profiles" ("device_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_05ec154a50bc72301203c0b5d9" ON "profiles" ("nickname_key") `);
        await queryRunner.query(`CREATE INDEX "IDX_a2e6077e2aeb02f564c97598d5" ON "profiles" ("team_num") `);
        await queryRunner.query(`CREATE TABLE "match_states" ("match_seq" integer NOT NULL, "status" character varying NOT NULL, "score_home" integer, "score_away" integer, "starts_at" TIMESTAMP WITH TIME ZONE, "last_change_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8581176ac58ad5d1837e6d09aed" PRIMARY KEY ("match_seq"))`);
        await queryRunner.query(`CREATE TABLE "live_events" ("id" SERIAL NOT NULL, "match_seq" integer NOT NULL, "row_key" text NOT NULL, "half" integer NOT NULL, "seq" integer NOT NULL, "clock" text NOT NULL, "minute" integer NOT NULL, "score_home" integer NOT NULL, "score_away" integer NOT NULL, "scored_by" character varying, "type" character varying NOT NULL, "side" character varying, "player_number" integer, "player_name" text, "action" text NOT NULL, "assist_number" integer, "assist_name" text, "home_text" text NOT NULL, "away_text" text NOT NULL, "observed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ff25dc1ee3cb53cbfbfae3e1ae9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_66ac282300330af76cd31de28d" ON "live_events" ("match_seq") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9f24da9f9eb272f22aaa442952" ON "live_events" ("match_seq", "row_key") `);
        await queryRunner.query(`CREATE TABLE "predictions" ("id" SERIAL NOT NULL, "match_seq" integer NOT NULL, "device_id" character varying(64) NOT NULL, "pick" character varying NOT NULL, "settled" boolean NOT NULL DEFAULT false, "hit" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_071f37f543abc888e8d894d29be" UNIQUE ("match_seq", "device_id"), CONSTRAINT "PK_b92c9e4db595214b289f5e28adc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_285d38f092f29002ebe82d74a9" ON "predictions" ("match_seq") `);
        await queryRunner.query(`CREATE TABLE "mvp_votes" ("id" SERIAL NOT NULL, "match_seq" integer NOT NULL, "device_id" character varying(64) NOT NULL, "player_seq" integer, "player_name" text NOT NULL, "side" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_04770dbb7b67ef8fc790e7b6b72" UNIQUE ("match_seq", "device_id"), CONSTRAINT "PK_1821ef0e9684e8cd621bea066a5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d94d69cd580dd1164871dfe1f2" ON "mvp_votes" ("match_seq") `);
        await queryRunner.query(`CREATE TABLE "cheers" ("id" SERIAL NOT NULL, "team_num" integer NOT NULL, "gender" character varying NOT NULL, "device_id" character varying(64) NOT NULL, "author_id" character varying(16), "text" character varying(200) NOT NULL, "likes" integer NOT NULL DEFAULT '0', "hidden" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_44ec16fb1a42e4c64e383e140a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_aa8f55873e8b5803084559d7f3" ON "cheers" ("team_num") `);
        await queryRunner.query(`CREATE INDEX "IDX_ee595189c1c20bdb6d8df2ac05" ON "cheers" ("device_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_aa2a0f4a5b18fb03ea10c8b350" ON "cheers" ("author_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_7e9b67e7fa284b73326f0d8527" ON "cheers" ("team_num", "created_at") `);
        await queryRunner.query(`CREATE TABLE "cheer_reports" ("id" SERIAL NOT NULL, "cheer_id" integer NOT NULL, "device_id" character varying(64) NOT NULL, "reason" character varying NOT NULL, "detail" character varying(200), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_0a760b12e894b4d2fda9de88d7a" UNIQUE ("cheer_id", "device_id"), CONSTRAINT "PK_9eeb3699cc3b2f39a0e99ea75b3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d5093c841b760d1a3e2dce906e" ON "cheer_reports" ("cheer_id") `);
        await queryRunner.query(`CREATE TABLE "cheer_likes" ("id" SERIAL NOT NULL, "cheer_id" integer NOT NULL, "device_id" character varying(64) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_77ab8d0c5b87470e82a9cfd95c7" UNIQUE ("cheer_id", "device_id"), CONSTRAINT "PK_fbc73c9e6ffffa993a06626f575" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3dee125f262eb03b95306ab5e4" ON "cheer_likes" ("cheer_id") `);
        await queryRunner.query(`CREATE TABLE "blocks" ("id" SERIAL NOT NULL, "device_id" character varying(64) NOT NULL, "author_id" character varying(16) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_ebf8433f6804ed970e85a890a4a" UNIQUE ("device_id", "author_id"), CONSTRAINT "PK_8244fa1495c4e9222a01059244b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ced45d13af26695c6640d98e0" ON "blocks" ("device_id") `);
        await queryRunner.query(`CREATE TABLE "match_meta" ("match_seq" integer NOT NULL, "season" character varying(4) NOT NULL, "gender" character varying NOT NULL, "league_type" character varying, "starts_at" TIMESTAMP WITH TIME ZONE, "home_name" text NOT NULL, "away_name" text NOT NULL, "home_logo_url" text, "away_logo_url" text, "venue" text, "score_home" integer, "score_away" integer, "result" character varying, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_693ae93a1ce6138fae12b5a21f4" PRIMARY KEY ("match_seq"))`);
        await queryRunner.query(`CREATE INDEX "IDX_61fd77c49961e613b350b92d65" ON "match_meta" ("season", "gender") `);
        await queryRunner.query(`CREATE TABLE "attendances" ("id" SERIAL NOT NULL, "device_id" character varying(64) NOT NULL, "match_seq" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c6317bc36b50657f09daae366fe" UNIQUE ("device_id", "match_seq"), CONSTRAINT "PK_483ed97cd4cd43ab4a117516b69" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b58d23787d8a7cf7b553828daa" ON "attendances" ("device_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b58d23787d8a7cf7b553828daa"`);
        await queryRunner.query(`DROP TABLE "attendances"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_61fd77c49961e613b350b92d65"`);
        await queryRunner.query(`DROP TABLE "match_meta"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ced45d13af26695c6640d98e0"`);
        await queryRunner.query(`DROP TABLE "blocks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3dee125f262eb03b95306ab5e4"`);
        await queryRunner.query(`DROP TABLE "cheer_likes"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5093c841b760d1a3e2dce906e"`);
        await queryRunner.query(`DROP TABLE "cheer_reports"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7e9b67e7fa284b73326f0d8527"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa2a0f4a5b18fb03ea10c8b350"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ee595189c1c20bdb6d8df2ac05"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa8f55873e8b5803084559d7f3"`);
        await queryRunner.query(`DROP TABLE "cheers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d94d69cd580dd1164871dfe1f2"`);
        await queryRunner.query(`DROP TABLE "mvp_votes"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_285d38f092f29002ebe82d74a9"`);
        await queryRunner.query(`DROP TABLE "predictions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9f24da9f9eb272f22aaa442952"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_66ac282300330af76cd31de28d"`);
        await queryRunner.query(`DROP TABLE "live_events"`);
        await queryRunner.query(`DROP TABLE "match_states"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a2e6077e2aeb02f564c97598d5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_05ec154a50bc72301203c0b5d9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_93a9ee433226aa0ebcfc36037d"`);
        await queryRunner.query(`DROP TABLE "profiles"`);
        await queryRunner.query(`DROP TABLE "push_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cc13ecc6fdf22f09515bd12ead"`);
        await queryRunner.query(`DROP TABLE "push_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a706a722abea8397ae180c787d"`);
        await queryRunner.query(`DROP TABLE "favorite_players"`);
        await queryRunner.query(`DROP TABLE "guide_progress"`);
        await queryRunner.query(`DROP TABLE "welcome_submissions"`);
    }

}
