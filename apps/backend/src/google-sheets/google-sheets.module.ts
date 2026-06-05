import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './google.strategy';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleSheetsController } from './google-sheets.controller';
import { SettingsModule } from '../settings/settings.module';
import { ImportModule } from '../import/import.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PassportModule, SettingsModule, ImportModule, PrismaModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleStrategy, GoogleSheetsService],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
