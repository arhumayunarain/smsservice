import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { ImportProcessor } from './import.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'import' }),
    SettingsModule,
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportProcessor],
  exports: [ImportService],
})
export class ImportModule {}
