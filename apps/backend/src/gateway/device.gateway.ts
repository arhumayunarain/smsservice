import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DevicesService } from '../devices/devices.service';
import { SmsService } from '../sms/sms.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryDto } from '../devices/dto/telemetry.dto';
import { MessageStatus, CampaignStatus } from '@prisma/client';

interface SmsStatusPayload {
  messageId: string;
  status: 'SENT_TO_DEVICE' | 'DELIVERED' | 'FAILED';
  error?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 20000,
})
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DeviceGateway.name);

  // Map deviceId -> socketId for efficient routing
  private readonly deviceSocketMap = new Map<string, string>();

  // Map socketId -> deviceId (reverse lookup for disconnect)
  private readonly socketDeviceMap = new Map<string, string>();

  // Sockets waiting for auth (auto-disconnect after timeout)
  private readonly pendingAuth = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly devicesService: DevicesService,
    @Inject(forwardRef(() => SmsService))
    private readonly smsService: SmsService,
    private readonly prisma: PrismaService,
    @InjectQueue('sms') private readonly smsQueue: Queue,
    @InjectQueue('campaigns') private readonly campaignsQueue: Queue,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Socket ${client.id} connected — waiting for device:auth`);

    client.on('device:auth', async (data: any) => {
      this.logger.log(`Received device:auth from ${client.id}: ${JSON.stringify(data)}`);
      await this.authenticateDevice(client, data);
    });

    // Give client 15 seconds to send device:auth
    // If no auth received, keep connected (could be dashboard client)
    const timeout = setTimeout(() => {
      if (!this.socketDeviceMap.has(client.id)) {
        this.logger.log(`Socket ${client.id} — no device:auth received (likely dashboard client)`);
        this.pendingAuth.delete(client.id);
      }
    }, 15000);

    this.pendingAuth.set(client.id, timeout);
  }

  async handleDisconnect(client: Socket) {
    // Clean up pending auth timeout
    const timeout = this.pendingAuth.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAuth.delete(client.id);
    }

    const deviceId = this.socketDeviceMap.get(client.id);
    if (!deviceId) return;

    // Clean up maps
    this.socketDeviceMap.delete(client.id);
    this.deviceSocketMap.delete(deviceId);

    // Update DB
    try {
      await this.devicesService.markOffline(deviceId);
    } catch {
      this.logger.warn(`Failed to mark device ${deviceId} offline`);
    }

    this.logger.log(`Device ${deviceId} disconnected - socket ${client.id}`);

    // Broadcast status change
    this.server.emit('device:status_changed', {
      deviceId,
      online: false,
      lastSeen: new Date().toISOString(),
    });

    // Auto-pause running campaigns if no other online device exists
    try {
      const onlineDeviceCount = await this.prisma.device.count({
        where: { online: true },
      });

      if (onlineDeviceCount === 0) {
        const runningCampaigns = await this.prisma.campaign.findMany({
          where: { status: CampaignStatus.RUNNING },
          select: { id: true },
        });

        if (runningCampaigns.length > 0) {
          // Pause queues
          await this.smsQueue.pause();
          await this.campaignsQueue.pause();

          // Update all running campaigns to PAUSED
          await this.prisma.campaign.updateMany({
            where: { status: CampaignStatus.RUNNING },
            data: { status: CampaignStatus.PAUSED },
          });

          const campaignIds = runningCampaigns.map((c) => c.id);
          this.logger.log(
            `Auto-paused ${runningCampaigns.length} campaign(s) — last device went offline`,
          );

          // Notify dashboard
          this.server.emit('campaign:auto-paused', {
            reason: 'last_device_offline',
            campaignIds,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Auto-pause check failed: ${err}`);
    }
  }

  private async authenticateDevice(
    client: Socket,
    data: any,
  ) {
    const deviceId = data?.deviceId;
    const registrationToken = data?.registrationToken;

    if (!deviceId || !registrationToken) {
      this.logger.warn(`Auth rejected: missing fields - socket ${client.id}`);
      client.emit('device:auth_result', { success: false, error: 'Missing deviceId or registrationToken' });
      client.disconnect();
      return;
    }

    // Clear pending auth timeout
    const timeout = this.pendingAuth.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAuth.delete(client.id);
    }

    // Validate registration token
    const device = await this.devicesService.findByRegistrationToken(registrationToken);
    if (!device || device.id !== deviceId) {
      this.logger.warn(`Auth rejected: invalid token for device ${deviceId}`);
      client.emit('device:auth_result', { success: false, error: 'Invalid credentials' });
      client.disconnect();
      return;
    }

    // Track in maps
    this.deviceSocketMap.set(deviceId, client.id);
    this.socketDeviceMap.set(client.id, deviceId);

    // Join device-specific room
    await client.join(`device:${deviceId}`);

    // Update DB
    await this.devicesService.markOnline(deviceId, client.id);

    this.logger.log(`Device ${deviceId} (${device.name}) authenticated - socket ${client.id}`);

    // Tell client auth succeeded
    client.emit('device:auth_result', { success: true });

    // Broadcast status change to all dashboard clients
    this.server.emit('device:status_changed', {
      deviceId,
      online: true,
      lastSeen: new Date().toISOString(),
    });
  }

  @SubscribeMessage('device:telemetry')
  async handleTelemetry(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TelemetryDto,
  ) {
    const deviceId = this.socketDeviceMap.get(client.id);
    if (!deviceId) return;

    await this.devicesService.updateTelemetry(deviceId, data);

    // Broadcast updated telemetry to dashboard clients
    this.server.emit('device:telemetry_updated', { deviceId, ...data });
  }

  @SubscribeMessage('sms:status')
  async handleSmsStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: SmsStatusPayload,
  ) {
    const { messageId, status, error } = data;

    await this.smsService.updateStatus(
      messageId,
      status as MessageStatus,
      error,
    );

    // Broadcast status update to dashboard clients
    this.server.emit('sms:status_updated', { messageId, status, error });

    // Emit campaign progress update if this message belongs to a campaign
    const progress = await this.smsService.getCampaignProgress(messageId);
    if (progress) {
      this.server.emit('campaign:progress_updated', progress);

      // Auto-complete campaign when all messages have a final status
      if (progress.pending === 0) {
        try {
          const campaign = await this.prisma.campaign.findUnique({
            where: { id: progress.campaignId },
            select: { status: true },
          });
          if (campaign?.status === CampaignStatus.RUNNING) {
            await this.prisma.campaign.update({
              where: { id: progress.campaignId },
              data: {
                status: CampaignStatus.COMPLETED,
                completedAt: new Date(),
              },
            });
            this.logger.log(`Campaign ${progress.campaignId} auto-completed — all messages processed`);
            this.server.emit('campaign:status_changed', {
              campaignId: progress.campaignId,
              status: CampaignStatus.COMPLETED,
            });
          }
        } catch (err) {
          this.logger.warn(`Failed to auto-complete campaign ${progress.campaignId}: ${err}`);
        }
      }
    }
  }

  /**
   * Send an SMS command to a connected device.
   * Called by SmsProcessor when processing a queued job.
   * Includes simSlot preference from Device settings if set.
   */
  async sendToDevice(
    deviceId: string,
    messageId: string,
    recipient: string,
    body: string,
  ): Promise<boolean> {
    const socketId = this.deviceSocketMap.get(deviceId);

    if (!socketId) {
      this.logger.warn(`Device ${deviceId} not connected, cannot send SMS ${messageId}`);
      return false;
    }

    // Read device's simSlot preference
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { simSlot: true },
    });

    this.server.to(`device:${deviceId}`).emit('sms:send', {
      messageId,
      recipient,
      body,
      simSlot: device?.simSlot ?? null,
    });

    this.logger.log(`SMS ${messageId} dispatched to device ${deviceId} (simSlot=${device?.simSlot ?? 'auto'})`);
    return true;
  }

  isDeviceOnline(deviceId: string): boolean {
    return this.deviceSocketMap.has(deviceId);
  }
}
