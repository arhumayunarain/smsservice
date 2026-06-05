import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { SmsService } from './sms.service';
import { DeviceGateway } from '../gateway/device.gateway';
import { MessageStatus } from '@prisma/client';

interface SmsJobData {
  messageId: string;
  deviceId: string;
  recipient: string;
  body: string;
}

@Processor('sms')
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    private readonly smsService: SmsService,
    @Inject(forwardRef(() => DeviceGateway))
    private readonly deviceGateway: DeviceGateway,
  ) {
    super();
  }

  async process(job: Job<SmsJobData>): Promise<void> {
    const { messageId, deviceId, recipient, body } = job.data;

    this.logger.log(`Processing SMS job ${job.id} for message ${messageId}`);

    // Check if device is connected
    const isOnline = this.deviceGateway.isDeviceOnline(deviceId);

    if (!isOnline) {
      this.logger.warn(`Device ${deviceId} is offline, marking message ${messageId} as FAILED`);
      await this.smsService.updateStatus(
        messageId,
        MessageStatus.FAILED,
        'Device offline',
      );
      return;
    }

    // Update status to SENT_TO_DEVICE
    await this.smsService.updateStatus(messageId, MessageStatus.SENT_TO_DEVICE);

    // Dispatch to device via Socket.IO
    const dispatched = await this.deviceGateway.sendToDevice(deviceId, messageId, recipient, body);

    if (!dispatched) {
      // Device went offline between check and dispatch
      await this.smsService.updateStatus(
        messageId,
        MessageStatus.FAILED,
        'Device disconnected before dispatch',
      );
    }
  }
}
