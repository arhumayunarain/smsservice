import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PostexService } from './postex.service';
import { PostexController } from './postex.controller';
import { SettingsModule } from '../settings/settings.module';
import { ImportModule } from '../import/import.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [HttpModule, SettingsModule, ImportModule, PrismaModule],
  controllers: [PostexController],
  providers: [PostexService],
  exports: [PostexService],
})
export class PostexModule {}
