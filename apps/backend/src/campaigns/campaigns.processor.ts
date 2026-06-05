import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { OutreachService } from '../outreach/outreach.service';
import { CampaignStatus, SendVia, MessageStatus } from '@prisma/client';

interface CampaignJobData {
  campaignId: string;
}

@Processor('campaigns')
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly outreachService: OutreachService,
    @InjectQueue('sms') private readonly smsQueue: Queue,
  ) {
    super();
  }

  private renderTemplate(body: string, variables: Record<string, string>): string {
    return body.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
  }

  async process(job: Job<CampaignJobData>): Promise<void> {
    const { campaignId } = job.data;
    this.logger.log(`Processing campaign job ${job.id} for campaign ${campaignId}`);

    // Load campaign with template and recipients
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        recipients: true,
        device: true,
      },
    });

    if (!campaign) {
      this.logger.error(`Campaign ${campaignId} not found`);
      return;
    }

    // Route to the appropriate sending method
    if (campaign.sendVia === SendVia.API) {
      await this.processApiCampaign(campaign);
    } else {
      await this.processDeviceCampaign(campaign);
    }
  }

  /**
   * Send campaign via Outreach API - sends each message directly via HTTP.
   */
  private async processApiCampaign(campaign: any): Promise<void> {
    const campaignId = campaign.id;

    // Update campaign status to RUNNING, set startedAt
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    let aborted = false;
    const ABORT_CHECK_INTERVAL = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < campaign.recipients.length; i++) {
      const recipient = campaign.recipients[i];

      // Check if campaign has been aborted
      if (i % ABORT_CHECK_INTERVAL === 0) {
        const fresh = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });

        if (fresh?.status === CampaignStatus.ABORTED) {
          this.logger.log(`Campaign ${campaignId} was aborted - stopping API dispatch`);
          aborted = true;
          break;
        }
      }

      // Render template body with recipient variables
      const renderedBody = this.renderTemplate(
        campaign.template.body,
        recipient.variables as Record<string, string>,
      );

      // Create message record
      const message = await this.smsService.createApiMessage(
        recipient.phoneNumber,
        renderedBody,
        campaignId,
      );

      // Update CampaignRecipient with message ID
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { messageId: message.id },
      });

      // Send via Outreach API
      try {
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
          successCount++;
          this.logger.log(
            `API SMS sent for campaign ${campaignId} to ${recipient.phoneNumber} (txn: ${result.transactionId})`,
          );
        } else {
          await this.prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.FAILED,
              outreachTransactionId: result.transactionId,
              error: `Outreach error ${result.code}: ${result.message}`,
            },
          });
          failCount++;
          this.logger.warn(
            `API SMS failed for campaign ${campaignId} to ${recipient.phoneNumber}: ${result.message}`,
          );
        }
      } catch (err) {
        await this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.FAILED,
            error: `API call error: ${err}`,
          },
        });
        failCount++;
        this.logger.error(
          `API SMS exception for campaign ${campaignId} to ${recipient.phoneNumber}: ${err}`,
        );
      }
    }

    // Auto-complete API campaigns since we get immediate responses
    if (!aborted) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `Campaign ${campaignId} completed via API: ${successCount} sent, ${failCount} failed out of ${campaign.recipients.length}`,
      );
    }
  }

  /**
   * Send campaign via device (original flow - queues through BullMQ).
   */
  private async processDeviceCampaign(campaign: any): Promise<void> {
    const campaignId = campaign.id;

    // Re-apply rate limit from device settings at campaign start
    const device = campaign.device;
    if (device?.rateLimitMax && device?.rateLimitUnit) {
      const durationMs = device.rateLimitUnit === 'per_hour' ? 3_600_000 : 60_000;
      await this.smsQueue.setGlobalRateLimit(device.rateLimitMax, durationMs);
      this.logger.log(
        `Rate limit applied for campaign ${campaignId}: ${device.rateLimitMax}/${device.rateLimitUnit}`,
      );
    }

    // Update campaign status to RUNNING, set startedAt
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    let aborted = false;
    const ABORT_CHECK_INTERVAL = 50;

    // Iterate recipients
    for (let i = 0; i < campaign.recipients.length; i++) {
      const recipient = campaign.recipients[i];

      // Check if campaign has been aborted every N recipients (not every single one)
      if (i % ABORT_CHECK_INTERVAL === 0) {
        const fresh = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });

        if (fresh?.status === CampaignStatus.ABORTED) {
          this.logger.log(`Campaign ${campaignId} was aborted — stopping dispatch`);
          aborted = true;
          break;
        }
      }

      // Render template body with recipient variables
      const renderedBody = this.renderTemplate(
        campaign.template.body,
        recipient.variables as Record<string, string>,
      );

      // Send SMS — creates Message + queues SMS job
      const message = await this.smsService.send(
        campaign.deviceId,
        recipient.phoneNumber,
        renderedBody,
        campaignId,
      );

      // Update CampaignRecipient with message ID
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { messageId: message.id },
      });

      this.logger.log(
        `Dispatched SMS for campaign ${campaignId} to ${recipient.phoneNumber} (message: ${message.id})`,
      );
    }

    // After loop: campaign stays RUNNING — it will be marked COMPLETED
    // automatically when the last message gets a final status (SENT_TO_DEVICE,
    // DELIVERED, or FAILED) via the device gateway's handleSmsStatus handler.
    if (!aborted) {
      this.logger.log(
        `Campaign ${campaignId} — all ${campaign.recipients.length} messages queued, awaiting delivery`,
      );
    }
  }
}
