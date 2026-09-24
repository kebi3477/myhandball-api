import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TeamListModule } from "../team/team-list.module";
import { ProfileController } from "./profile.controller";
import { Profile } from "./profile.entity";
import { ProfileService } from "./profile.service";

@Module({
  imports: [TypeOrmModule.forFeature([Profile]), TeamListModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
