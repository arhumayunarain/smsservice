import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { OutreachService } from '../outreach/outreach.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignStatus, MessageStatus, Prisma, SendVia } from '@prisma/client';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly outreachService: OutreachService,
    @InjectQueue('campaigns') private readonly campaignQueue: Queue,
    @InjectQueue('sms') private readonly smsQueue: Queue,
  ) {}

  private renderTemplate(body: string, variables: Record<string, string>): string {
    return body.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
  }

  async create(dto: CreateCampaignDto) {
    // Validate that at least one recipient source is provided
    if (!dto.recipientListId && (!dto.recipients || dto.recipients.length === 0)) {
      throw new BadRequestException('Either recipientListId or recipients must be provided');
    }

    const sendVia = dto.sendVia === 'DEVICE' ? SendVia.DEVICE : SendVia.API;

    // Validate template exists
    const template = await this.prisma.template.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} not found`);
    }

    // Validate device exists (only required for DEVICE sending)
    if (sendVia === SendVia.DEVICE) {
      if (!dto.deviceId) {
        throw new BadRequestException('deviceId is required when sendVia is DEVICE');
      }
      const device = await this.prisma.device.findUnique({
        where: { id: dto.deviceId },
      });
      if (!device) {
        throw new NotFoundException(`Device ${dto.deviceId} not found`);
      }
    }

    // Create campaign + recipients in transaction
    const campaign = await this.prisma.$transaction(async (tx) => {
      const newCampaign = await tx.campaign.create({
        data: {
          name: dto.name,
          templateId: dto.templateId,
          deviceId: dto.deviceId ?? null,
          sendVia,
          recipientListId: dto.recipientListId ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          timezone: dto.timezone ?? null,
        },
      });

      if (dto.recipientListId) {
        // Verify list exists
        const list = await tx.recipientList.findUnique({
          where: { id: dto.recipientListId },
        });
        if (!list) throw new NotFoundException(`Recipient list ${dto.recipientListId} not found`);

        // Load list entries
        const entries = await tx.recipientListEntry.findMany({
          where: { listId: dto.recipientListId },
        });

        if (entries.length === 0) {
          throw new BadRequestException('Recipient list is empty');
        }

        // Map variables: if variableMapping is provided, remap list entry variables to template variables
        // If no mapping, pass variables through as-is
        const mapping = dto.variableMapping || {};

        await tx.campaignRecipient.createMany({
          data: entries.map((e) => {
            const rawVars = (e.variables as Record<string, string>) || {};
            const mappedVars: Record<string, string> = {};

            if (Object.keys(mapping).length > 0) {
              // Apply column mapping: mapping[listColumn] = templateVariable
              for (const [listCol, templateVar] of Object.entries(mapping)) {
                if (rawVars[listCol] !== undefined) {
                  mappedVars[templateVar] = rawVars[listCol];
                }
              }
            } else {
              // No mapping — pass through (column names already match template variables)
              Object.assign(mappedVars, rawVars);
            }

            return {
              campaignId: newCampaign.id,
              phoneNumber: e.phoneNumber,
              variables: mappedVars,
            };
          }),
        });
      } else if (dto.recipients && dto.recipients.length > 0) {
        // Existing manual recipients path — keep unchanged
        await tx.campaignRecipient.createMany({
          data: dto.recipients.map((r) => ({
            campaignId: newCampaign.id,
            phoneNumber: r.phoneNumber,
            variables: r.variables,
          })),
        });
      }

      return tx.campaign.findUnique({
        where: { id: newCampaign.id },
        include: {
          template: true,
          recipients: true,
        },
      });
    });

    return campaign;
  }

  async findAll() {
    return this.prisma.campaign.findMany({
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        device: { select: { id: true, name: true, online: true } },
        recipients: {
          include: {
            message: { select: { id: true, status: true, error: true, body: true, sentAt: true, deliveredAt: true } },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot update campaign in ${campaign.status} status. Only DRAFT or SCHEDULED campaigns can be updated.`,
      );
    }

    // If scheduled, cancel old job first
    if (campaign.status === CampaignStatus.SCHEDULED) {
      await this.cancelScheduledJob(campaign);
    }

    // Update in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.recipients) {
        // Delete old recipients and recreate
        await tx.campaignRecipient.deleteMany({ where: { campaignId: id } });
        await tx.campaignRecipient.createMany({
          data: dto.recipients.map((r) => ({
            campaignId: id,
            phoneNumber: r.phoneNumber,
            variables: r.variables,
          })),
        });
      }

      return tx.campaign.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.templateId && { templateId: dto.templateId }),
          ...(dto.deviceId && { deviceId: dto.deviceId }),
          ...(dto.scheduledAt !== undefined && {
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
          // Reset to DRAFT after update if it was SCHEDULED
          ...(campaign.status === CampaignStatus.SCHEDULED && { status: CampaignStatus.DRAFT, scheduledJobId: null }),
        },
        include: {
          template: true,
          recipients: true,
        },
      });
    });

    return updated;
  }

  async delete(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot delete campaign in ${campaign.status} status. Only DRAFT or SCHEDULED campaigns can be deleted.`,
      );
    }

    // Cancel scheduled job if exists
    if (campaign.status === CampaignStatus.SCHEDULED) {
      await this.cancelScheduledJob(campaign);
    }

    await this.prisma.campaign.delete({ where: { id } });
  }

  async sendNow(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot send campaign in ${campaign.status} status. Only DRAFT campaigns can be sent immediately.`,
      );
    }

    await this.campaignQueue.add(
      'dispatch-campaign',
      { campaignId: id },
      { jobId: `campaign-${id}` },
    );

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.RUNNING },
    });
  }

  async schedule(id: string, scheduledAt: Date) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot schedule campaign in ${campaign.status} status. Only DRAFT campaigns can be scheduled.`,
      );
    }

    const delay = scheduledAt.getTime() - Date.now();
    if (delay <= 0) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }

    const job = await this.campaignQueue.add(
      'dispatch-campaign',
      { campaignId: id },
      { delay, jobId: `campaign-${id}` },
    );

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt,
        scheduledJobId: job.id ?? null,
      },
    });
  }

  async cancelScheduledJob(campaign: { id: string; scheduledJobId: string | null }) {
    if (!campaign.scheduledJobId) return;

    try {
      const job = await Job.fromId(this.campaignQueue, campaign.scheduledJobId);
      if (job) {
        await job.remove();
      }
    } catch {
      // Job may already be active or removed — ignore
    }
  }

  async pause(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new BadRequestException(
        `Cannot pause campaign in ${campaign.status} status. Only RUNNING campaigns can be paused.`,
      );
    }

    await this.campaignQueue.pause();
    await this.smsQueue.pause();

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PAUSED },
    });
  }

  async resume(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume campaign in ${campaign.status} status. Only PAUSED campaigns can be resumed.`,
      );
    }

    await this.campaignQueue.resume();
    await this.smsQueue.resume();

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.RUNNING },
    });
  }

  async abort(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (
      campaign.status !== CampaignStatus.RUNNING &&
      campaign.status !== CampaignStatus.PAUSED
    ) {
      throw new BadRequestException(
        `Cannot abort campaign in ${campaign.status} status. Only RUNNING or PAUSED campaigns can be aborted.`,
      );
    }

    // Pause campaign queue to stop new dispatches
    await this.campaignQueue.pause();

    // Get waiting SMS jobs and remove those belonging to this campaign
    const waitingJobs = await this.smsQueue.getWaiting();
    for (const job of waitingJobs) {
      if (job.data.campaignId === id) {
        // Mark corresponding message as FAILED
        if (job.data.messageId) {
          try {
            await this.prisma.message.update({
              where: { id: job.data.messageId },
              data: { status: MessageStatus.FAILED, error: 'Campaign aborted' },
            });
          } catch {
            // Message may not exist — ignore
          }
        }
        await job.remove();
      }
    }

    // Update campaign status to ABORTED
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.ABORTED },
    });

    // Resume campaign queue for future campaigns
    await this.campaignQueue.resume();

    return updated;
  }

  async retryFailed(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        recipients: {
          include: {
            message: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (
      campaign.status !== CampaignStatus.COMPLETED &&
      campaign.status !== CampaignStatus.ABORTED
    ) {
      throw new BadRequestException(
        `Cannot retry failed messages for campaign in ${campaign.status} status. Only COMPLETED or ABORTED campaigns support retry.`,
      );
    }

    const failedRecipients = campaign.recipients.filter(
      (r) => r.message?.status === MessageStatus.FAILED,
    );

    if (failedRecipients.length === 0) {
      throw new BadRequestException('No failed messages to retry.');
    }

    if (campaign.sendVia === SendVia.API) {
      // Retry via Outreach API directly
      for (const recipient of failedRecipients) {
        const renderedBody = this.renderTemplate(
          campaign.template.body,
          recipient.variables as Record<string, string>,
        );

        const message = await this.smsService.createApiMessage(
          recipient.phoneNumber,
          renderedBody,
          id,
        );

        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { messageId: message.id },
        });

        const result = await this.outreachService.sendSms(
          recipient.phoneNumber,
          renderedBody,
        );

        if (result.success) {
          await this.prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.DELIVERED,
              outreachTransactionId: result.transactionId,
              sentAt: new Date(),
              deliveredAt: new Date(),
            },
          });
        } else {
          await this.prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.FAILED,
              outreachTransactionId: result.transactionId,
              error: `Outreach error ${result.code}: ${result.message}`,
            },
          });
        }
      }

      return this.prisma.campaign.update({
        where: { id },
        data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
      });
    } else {
      // Re-queue per-recipient SMS for each failed recipient via device
      for (const recipient of failedRecipients) {
        const renderedBody = this.renderTemplate(
          campaign.template.body,
          recipient.variables as Record<string, string>,
        );

        const message = await this.smsService.send(
          campaign.deviceId!,
          recipient.phoneNumber,
          renderedBody,
          id,
        );

        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { messageId: message.id },
        });
      }

      return this.prisma.campaign.update({
        where: { id },
        data: { status: CampaignStatus.RUNNING },
      });
    }
  }

  async clone(id: string) {
    const source = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        recipients: {
          select: { phoneNumber: true, variables: true },
        },
      },
    });

    if (!source) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const newCampaign = await tx.campaign.create({
        data: {
          name: `Copy of ${source.name}`,
          templateId: source.templateId,
          deviceId: source.deviceId,
          sendVia: source.sendVia,
          recipientListId: source.recipientListId,
          status: CampaignStatus.DRAFT,
        },
      });

      if (source.recipients.length > 0) {
        await tx.campaignRecipient.createMany({
          data: source.recipients.map((r) => ({
            campaignId: newCampaign.id,
            phoneNumber: r.phoneNumber,
            variables: (r.variables ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }

      return tx.campaign.findUnique({
        where: { id: newCampaign.id },
        include: {
          template: true,
          recipients: true,
        },
      });
    });
  }

  async getProgress(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId },
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

    return { campaignId, total, sent, pending, failed };
  }

  async testSend(
    recipient: string,
    templateBody: string,
    variables: Record<string, string>,
  ) {
    const rendered = this.renderTemplate(templateBody, variables);
    const message = await this.smsService.createApiMessage(recipient, rendered);
    const result = await this.outreachService.sendSms(recipient, rendered);

    if (result.success) {
      return this.smsService.updateStatus(message.id, MessageStatus.DELIVERED);
    } else {
      return this.smsService.updateStatus(
        message.id,
        MessageStatus.FAILED,
        `Outreach error ${result.code}: ${result.message}`,
      );
    }
  }

  async getQueueStats(_campaignId: string): Promise<{
    waiting: number;
    active: number;
    etaSeconds: number | null;
    rateLimit: { max: number; duration: number } | null;
  }> {
    const counts = await this.smsQueue.getJobCounts('waiting', 'active', 'delayed');
    const rateLimit = await this.smsQueue.getGlobalRateLimit();
    let etaSeconds: number | null = null;
    if (rateLimit && rateLimit.max > 0) {
      const mps = rateLimit.max / (rateLimit.duration / 1000);
      etaSeconds = Math.ceil((counts.waiting ?? 0) / mps);
    }
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      etaSeconds,
      rateLimit: rateLimit ?? null,
    };
  }

  /**
   * Returns the last N campaigns with per-campaign delivery stats.
   * Uses a single raw SQL query for all message stats instead of N+1.
   */
  async getCampaignHistory(limit = 10) {
    const campaigns = await this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        template: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
    });

    if (campaigns.length === 0) return [];

    // Single query for all campaign message stats (replaces N+1)
    const campaignIds = campaigns.map((c) => c.id);
    type StatsRow = { campaignId: string; status: string; count: number };
    const stats = await this.prisma.$queryRaw<StatsRow[]>`
      SELECT "campaignId", status, COUNT(*)::int as count
      FROM "Message"
      WHERE "campaignId" IN (${Prisma.join(campaignIds)})
      GROUP BY "campaignId", status
    `;

    // Build lookup: campaignId -> { sent, delivered, failed }
    const statsMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    for (const row of stats) {
      if (!statsMap.has(row.campaignId)) {
        statsMap.set(row.campaignId, { sent: 0, delivered: 0, failed: 0 });
      }
      const entry = statsMap.get(row.campaignId)!;
      if (
        row.status === 'QUEUED' ||
        row.status === 'SENT_TO_DEVICE' ||
        row.status === 'DELIVERED'
      ) {
        entry.sent += row.count;
      }
      if (row.status === 'DELIVERED') {
        entry.delivered += row.count;
      }
      if (row.status === 'FAILED') {
        entry.failed += row.count;
      }
    }

    return campaigns.map((campaign) => {
      const s = statsMap.get(campaign.id) ?? { sent: 0, delivered: 0, failed: 0 };
      const total = campaign._count.recipients;
      const deliveryRate = total > 0 ? Math.round((s.delivered / total) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        template: campaign.template,
        device: campaign.device,
        recipientCount: total,
        sent: s.sent,
        delivered: s.delivered,
        failed: s.failed,
        deliveryRate,
        createdAt: campaign.createdAt,
        completedAt: campaign.completedAt,
      };
    });
  }
}
