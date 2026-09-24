import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CatalogModule } from "../catalog/catalog.module";
import { AttendanceController } from "./attendance.controller";
import { Attendance } from "./attendance.entity";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [TypeOrmModule.forFeature([Attendance]), CatalogModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
