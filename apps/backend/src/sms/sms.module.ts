import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { SmsProcessor } from './sms.processor';
import { GatewayModule } from '../gateway/gateway.module';
import { OutreachModule } from '../outreach/outreach.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sms' }),
    forwardRef(() => GatewayModule),
    OutreachModule,
  ],
  providers: [SmsService, SmsProcessor],
  controllers: [SmsController],
  exports: [SmsService],
})
export class SmsModule {}
