import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryDto } from './dto/telemetry.dto';
import * as crypto from 'crypto';

@Injectable()
export class DevicesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sms') private readonly smsQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.applyStoredRateLimit();
  }

  async register(name: string) {
    const registrationToken = crypto.randomBytes(16).toString('hex');
    return this.prisma.device.create({
      data: {
        name,
        registrationToken,
      },
    });
  }

  async findAll() {
    return this.prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.device.findUnique({ where: { id } });
  }

  async findByRegistrationToken(token: string) {
    return this.prisma.device.findUnique({
      where: { registrationToken: token },
    });
  }

  async markOnline(deviceId: string, socketId: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        online: true,
        socketId,
        lastSeen: new Date(),
      },
    });
  }

  async markOffline(deviceId: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        online: false,
        socketId: null,
        lastSeen: new Date(),
      },
    });
  }

  async updateTelemetry(deviceId: string, data: TelemetryDto) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        battery: data.battery,
        simCarrier: data.simCarrier,
        phoneNumber: data.phoneNumber,
        signalStrength: data.signalStrength,
        androidVersion: data.androidVersion,
        appVersion: data.appVersion,
        networkType: data.networkType,
        ...(data.sims !== undefined && { sims: data.sims as object }),
        lastSeen: new Date(),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Nullify CampaignRecipient -> Message links for this device's messages
      const deviceMessages = await tx.message.findMany({
        where: { deviceId: id },
        select: { id: true },
      });
      const messageIds = deviceMessages.map((m) => m.id);
      if (messageIds.length > 0) {
        await tx.campaignRecipient.updateMany({
          where: { messageId: { in: messageIds } },
          data: { messageId: null },
        });
      }

      // Delete messages for this device
      await tx.message.deleteMany({ where: { deviceId: id } });

      // Delete campaigns for this device (cascades to campaign recipients)
      await tx.campaign.deleteMany({ where: { deviceId: id } });

      // Delete the device
      return tx.device.delete({ where: { id } });
    });
  }

  async updateRateLimit(
    deviceId: string,
    max: number | null,
    unit: 'per_minute' | 'per_hour' | null,
  ): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { rateLimitMax: max, rateLimitUnit: unit },
    });

    if (max === null || unit === null) {
      await this.smsQueue.removeGlobalRateLimit();
      this.logger.log(`Rate limit cleared for device ${deviceId}`);
    } else {
      const durationMs = unit === 'per_hour' ? 3_600_000 : 60_000;
      await this.smsQueue.setGlobalRateLimit(max, durationMs);
      this.logger.log(`Rate limit set for device ${deviceId}: ${max}/${unit}`);
    }
  }

  async applyStoredRateLimit(): Promise<void> {
    const devices = await this.prisma.device.findMany({
      where: { rateLimitMax: { not: null } },
    });

    if (devices.length > 0) {
      const device = devices[0];
      if (device.rateLimitMax && device.rateLimitUnit) {
        const durationMs = device.rateLimitUnit === 'per_hour' ? 3_600_000 : 60_000;
        await this.smsQueue.setGlobalRateLimit(device.rateLimitMax, durationMs);
        this.logger.log(
          `Rate limit applied from stored settings: ${device.rateLimitMax}/${device.rateLimitUnit}`,
        );
      }
    }
  }

  async updateSimSlot(deviceId: string, simSlot: number | null): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { simSlot },
    });
  }
}
