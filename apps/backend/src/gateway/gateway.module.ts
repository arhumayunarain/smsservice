import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeviceGateway } from './device.gateway';
import { DevicesModule } from '../devices/devices.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    DevicesModule,
    forwardRef(() => SmsModule),
    BullModule.registerQueue({ name: 'sms' }),
    BullModule.registerQueue({ name: 'campaigns' }),
  ],
  providers: [DeviceGateway],
  exports: [DeviceGateway],
})
export class GatewayModule {}
