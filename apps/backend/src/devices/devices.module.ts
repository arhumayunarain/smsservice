import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sms' }), // Required for @InjectQueue('sms') in DevicesService (rate limit)
  ],
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
