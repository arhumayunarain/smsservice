import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PassThrough } from 'stream';
import { format as csvFormat } from '@fast-csv/format';
import { PrismaService } from '../prisma/prisma.service';
import { MessageStatus } from '@prisma/client';
import { MessageFilterDto } from './dto/message-filter.dto';

@Injectable()
export class SmsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sms') private readonly smsQueue: Queue,
  ) {}

  async send(deviceId: string, recipient: string, body: string, campaignId?: string) {
    // Verify device exists
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new BadRequestException(`Device ${deviceId} not found`);
    }

    // Create message with PENDING status before queuing
    const message = await this.prisma.message.create({
      data: {
        deviceId,
        recipient,
        body,
        status: MessageStatus.PENDING,
        campaignId: campaignId ?? null,
      },
    });

    await this.smsQueue.add('send', {
      messageId: message.id,
      deviceId,
      recipient,
      body,
      campaignId,
    });

    // Update to QUEUED with queuedAt timestamp after BullMQ job added
    const queued = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.QUEUED, queuedAt: new Date() },
    });

    return queued;
  }

  /**
   * Create a message record for API-based sending (no device, no BullMQ queue).
   * The actual API call is handled by the caller (OutreachService).
   */
  /**
   * Create a message record for API-based sending (no device, no BullMQ queue).
   * The actual API call is handled by the caller (OutreachService).
   */
  async createApiMessage(recipient: string, body: string, campaignId?: string) {
    return this.prisma.message.create({
      data: {
        deviceId: null,
        recipient,
        body,
        status: MessageStatus.PENDING,
        campaignId: campaignId ?? null,
      },
    });
  }

  async setOutreachTransactionId(messageId: string, transactionId: string | null) {
    if (!transactionId) return;
    return this.prisma.message.update({
      where: { id: messageId },
      data: { outreachTransactionId: transactionId },
    });
  }

  async updateStatus(
    messageId: string,
    status: MessageStatus,
    error?: string,
  ) {
    const data: {
      status: MessageStatus;
      error?: string;
      sentAt?: Date;
      deliveredAt?: Date;
    } = { status };

    if (error) {
      data.error = error;
    }

    if (status === MessageStatus.SENT_TO_DEVICE) {
      data.sentAt = new Date();
    }

    if (status === MessageStatus.DELIVERED) {
      data.deliveredAt = new Date();
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data,
    });
  }

  async findByDevice(deviceId: string, limit = 50) {
    return this.prisma.message.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findAll(limit = 50) {
    return this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        device: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      include: {
        device: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Build a Prisma where clause from filter DTO.
   */
  private buildWhereClause(filter: MessageFilterDto) {
    const where: Record<string, unknown> = {};

    if (filter.campaignId) {
      where.campaignId = filter.campaignId;
    }

    if (filter.status) {
      where.status = filter.status as MessageStatus;
    }

    if (filter.phone) {
      where.recipient = { contains: filter.phone };
    }

    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {
        ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
        ...(filter.dateTo ? { lte: new Date(filter.dateTo + 'T23:59:59.999Z') } : {}),
      };
    }

    return where;
  }

  /**
   * Paginated filtered message query for the logs page.
   */
  async findMessages(filter: MessageFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filter);

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          device: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true, template: { select: { name: true } } } },
          campaignRecipient: { select: { variables: true } },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      messages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Streams messages for CSV export using cursor-based pagination.
   * No row limit — constant memory usage regardless of export size.
   */
  async streamMessagesForExport(filter: MessageFilterDto, output: PassThrough) {
    const where = this.buildWhereClause(filter);
    const BATCH_SIZE = 1000;
    const include = {
      campaign: {
        select: {
          id: true,
          name: true,
          template: { select: { name: true } },
        },
      },
      campaignRecipient: { select: { variables: true } },
    };

    const csvStream = csvFormat({
      headers: ['phone', 'message', 'status', 'timestamp', 'failureReason', 'campaignName', 'templateName', 'variables'],
    });
    csvStream.pipe(output);

    let cursor: string | undefined;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          include,
        });

        if (batch.length === 0) break;

        for (const m of batch) {
          csvStream.write({
            phone: m.recipient,
            message: m.body,
            status: m.status,
            timestamp: m.createdAt.toISOString(),
            failureReason: m.error ?? '',
            campaignName: (m.campaign as { name?: string } | null)?.name ?? '',
            templateName: (m.campaign as { template?: { name?: string } } | null)?.template?.name ?? '',
            variables: m.campaignRecipient
              ? JSON.stringify(m.campaignRecipient.variables)
              : '',
          });
        }

        cursor = batch[batch.length - 1].id;

        if (batch.length < BATCH_SIZE) break;
      }
    } finally {
      csvStream.end();
    }
  }

  /**
   * Returns today's summary stats for the dashboard.
   */
  async getDashboardStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const grouped = await this.prisma.message.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _count: { status: true },
    });

    let sentToday = 0;
    let deliveredToday = 0;

    for (const g of grouped) {
      if (
        g.status === MessageStatus.QUEUED ||
        g.status === MessageStatus.SENT_TO_DEVICE ||
        g.status === MessageStatus.DELIVERED ||
        g.status === MessageStatus.FAILED
      ) {
        sentToday += g._count.status;
      }
      if (g.status === MessageStatus.DELIVERED) {
        deliveredToday = g._count.status;
      }
    }

    const deliveryRate = sentToday > 0 ? Math.round((deliveredToday / sentToday) * 100) : 0;

    const devices = await this.prisma.device.findMany({
      select: { id: true, name: true, online: true },
    });

    return { sentToday, deliveredToday, deliveryRate, devices };
  }

  /**
   * Returns daily send counts for the trend chart.
   */
  async getDailySendCounts(days: 7 | 30): Promise<Array<{ date: string; count: number }>> {
    type RawRow = { date: Date; count: bigint };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        date_trunc('day', "createdAt") AS date,
        COUNT(*) AS count
      FROM "Message"
      WHERE "createdAt" >= NOW() - (${days} || ' days')::INTERVAL
        AND "status" NOT IN ('PENDING')
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY date_trunc('day', "createdAt") ASC
    `;

    return rows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      count: Number(r.count),
    }));
  }

  async getCampaignProgress(messageId: string): Promise<{
    campaignId: string;
    total: number;
    sent: number;
    pending: number;
    failed: number;
  } | null> {
    const cr = await this.prisma.campaignRecipient.findUnique({
      where: { messageId },
      select: { campaignId: true },
    });
    if (!cr) return null;

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: cr.campaignId },
      include: { message: { select: { status: true } } },
    });

    const total = recipients.length;
    const sent = recipients.filter(
      (r) =>
        r.message?.status === MessageStatus.DELIVERED ||
        r.message?.status === MessageStatus.SENT_TO_DEVICE,
    ).length;
    const failed = recipients.filter(
      (r) => r.message?.status === MessageStatus.FAILED,
    ).length;
    const pending = total - sent - failed;

    return { campaignId: cr.campaignId, total, sent, pending, failed };
  }
}
