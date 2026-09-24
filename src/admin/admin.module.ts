import { Module } from "@nestjs/common";
import { BackupModule } from "../backup/backup.module";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminApiController, AdminPageController } from "./admin.controller";
import { AdminTablesService } from "./admin-tables.service";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [BackupModule],
  controllers: [AdminPageController, AdminApiController],
  providers: [AdminAuthGuard, AdminTablesService, ModerationService],
})
export class AdminModule {}
