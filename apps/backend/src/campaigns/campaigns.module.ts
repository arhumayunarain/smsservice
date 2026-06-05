import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SmsModule } from '../sms/sms.module';
import { OutreachModule } from '../outreach/outreach.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaigns' }),
    BullModule.registerQueue({ name: 'sms' }), // Required for @InjectQueue('sms') in CampaignsService (abort/pause/resume)
    SmsModule, // For SmsService — no forwardRef needed, no circular dependency
    OutreachModule, // For API-based sending via Outreach
  ],
  providers: [CampaignsService, CampaignsProcessor],
  controllers: [CampaignsController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
