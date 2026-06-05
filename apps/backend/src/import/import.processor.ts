import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportJobStatus } from '@prisma/client';

interface ImportJobData {
  importJobId: string;
  campaignId: string;
  duplicateResolution?: 'keep_first' | 'keep_last';
}

@Processor('import')
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ImportJobData>): Promise<void> {
    const { importJobId, campaignId, duplicateResolution } = job.data;
    this.logger.log(`Processing import job ${job.id} for import ${importJobId}`);

    // Update to PROCESSING
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { status: ImportJobStatus.PROCESSING },
    });

    try {
      const importJob = await this.prisma.importJob.findUnique({
        where: { id: importJobId },
      });
      if (!importJob) {
        throw new Error(`Import job ${importJobId} not found`);
      }

      const metadata = importJob.metadata as {
        validatedRecipients?: Array<{ phoneNumber: string; variables: Record<string, string> }>;
      };
      let recipients = metadata?.validatedRecipients ?? [];

      // Apply duplicate resolution
      if (duplicateResolution && recipients.length > 0) {
        const seen = new Map<string, number>();
        const resolved: typeof recipients = [];
        for (let i = 0; i < recipients.length; i++) {
          const r = recipients[i];
          if (seen.has(r.phoneNumber)) {
            if (duplicateResolution === 'keep_last') {
              const prevIdx = seen.get(r.phoneNumber)!;
              resolved[prevIdx] = r;
              seen.set(r.phoneNumber, prevIdx);
            }
            // keep_first: skip
          } else {
            seen.set(r.phoneNumber, resolved.length);
            resolved.push(r);
          }
        }
        recipients = resolved.filter(Boolean);
      }

      // Create recipients in batches of 100
      const BATCH_SIZE = 100;
      let created = 0;
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        await this.prisma.campaignRecipient.createMany({
          data: batch.map((r) => ({
            campaignId,
            phoneNumber: r.phoneNumber,
            variables: r.variables,
          })),
          skipDuplicates: false,
        });
        created += batch.length;
        this.logger.log(`Import ${importJobId}: created ${created}/${recipients.length} recipients`);
      }

      // Mark complete
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          campaignId,
          rowCount: created,
        },
      });

      this.logger.log(`Import job ${importJobId} completed: ${created} recipients created`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Import job ${importJobId} failed: ${message}`);
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.FAILED,
          error: message,
        },
      });
      throw error;
    }
  }
}
