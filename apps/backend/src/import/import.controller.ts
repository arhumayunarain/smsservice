import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportService } from './import.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ColumnMappingDto, ConfirmImportDto } from './dto/column-mapping.dto';

const ALLOWED_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

const LARGE_FILE_ROW_THRESHOLD = 1000;

@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    @InjectQueue('import') private readonly importQueue: Queue,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          // Also allow by extension
          const name = file.originalname?.toLowerCase() ?? '';
          if (name.endsWith('.csv') || name.endsWith('.xlsx')) {
            cb(null, true);
          } else {
            cb(new BadRequestException('Only CSV and XLSX files are allowed'), false);
          }
        }
      },
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.importService.parseFile(file);
  }

  @Post('map')
  async map(@Body() dto: ColumnMappingDto) {
    const result = await this.importService.validateAndMap(
      dto.importJobId,
      dto.phoneColumn,
      dto.variableMapping,
      dto.templateId,
    );
    // Store validated recipients for confirmation step
    if (result.valid) {
      await this.importService.storeValidatedRecipients(dto.importJobId, result.recipients);
    }
    return result;
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmImportDto) {
    const importJob = await this.prisma.importJob.findUnique({
      where: { id: dto.importJobId },
    });
    if (!importJob) {
      throw new BadRequestException(`Import job ${dto.importJobId} not found`);
    }

    const rowCount = importJob.rowCount ?? 0;

    if (rowCount > LARGE_FILE_ROW_THRESHOLD) {
      // Large file: process in background
      const job = await this.importQueue.add('process-import', {
        importJobId: dto.importJobId,
        campaignId: dto.campaignId,
        duplicateResolution: dto.duplicateResolution,
      });
      return { jobId: job.id, background: true };
    }

    // Small file: process synchronously
    const result = await this.importService.createRecipients(
      dto.importJobId,
      dto.campaignId,
      dto.duplicateResolution,
    );
    return result;
  }

  @Get('job/:id')
  async getJobStatus(@Param('id') id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) {
      throw new BadRequestException(`Import job ${id} not found`);
    }
    return {
      id: job.id,
      status: job.status,
      rowCount: job.rowCount,
      errorCount: job.errorCount,
      error: job.error,
      fileName: job.fileName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
