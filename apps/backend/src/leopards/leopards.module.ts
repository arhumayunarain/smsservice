import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LeopardsService } from './leopards.service';
import { LeopardsController } from './leopards.controller';
import { ImportModule } from '../import/import.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [HttpModule, ImportModule, PrismaModule],
  controllers: [LeopardsController],
  providers: [LeopardsService],
  exports: [LeopardsService],
})
export class LeopardsModule {}
