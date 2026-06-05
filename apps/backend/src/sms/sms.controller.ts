import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PassThrough } from 'stream';
import { Response } from 'express';
import { SmsService } from './sms.service';
import { OutreachService } from '../outreach/outreach.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { MessageFilterDto } from './dto/message-filter.dto';
import { MessageStatus } from '@prisma/client';

@Controller('sms')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly outreachService: OutreachService,
  ) {}

  @Post('send')
  async send(@Body() dto: SendSmsDto) {
    const recipientList = dto.recipient
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const results = [];
    for (const recipient of recipientList) {
      const message = await this.smsService.createApiMessage(recipient, dto.body);

      const result = await this.outreachService.sendSms(recipient, dto.body);

      if (result.success) {
        const updated = await this.smsService.updateStatus(
          message.id,
          MessageStatus.DELIVERED,
        );
        await this.smsService.setOutreachTransactionId(message.id, result.transactionId);
        results.push(updated);
      } else {
        const updated = await this.smsService.updateStatus(
          message.id,
          MessageStatus.FAILED,
          `Outreach error ${result.code}: ${result.message}`,
        );
        await this.smsService.setOutreachTransactionId(message.id, result.transactionId);
        results.push(updated);
      }
    }

    return results.length === 1 ? results[0] : results;
  }

  // GET /sms/logs — filterable, paginated message log
  @Get('logs')
  async getLogs(@Query() filter: MessageFilterDto) {
    return this.smsService.findMessages(filter);
  }

  // GET /sms/export — CSV download of filtered messages (streaming)
  @Get('export')
  async exportCsv(
    @Query() filter: MessageFilterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="messages.csv"',
    });

    const stream = new PassThrough();
    // Start async streaming (don't await — it pipes data as it reads)
    this.smsService.streamMessagesForExport(filter, stream);
    return new StreamableFile(stream);
  }

  // GET /sms/stats — dashboard summary stats (today)
  @Get('stats')
  async getDashboardStats() {
    return this.smsService.getDashboardStats();
  }

  // GET /sms/stats/daily — daily send counts for trend chart
  @Get('stats/daily')
  async getDailySendCounts(@Query('days') days?: string) {
    const parsedDays = days === '30' ? 30 : 7;
    return this.smsService.getDailySendCounts(parsedDays as 7 | 30);
  }

  @Get('messages')
  async findAll(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.smsService.findAll(parsedLimit);
  }

  @Get('messages/:id')
  async findOne(@Param('id') id: string) {
    const message = await this.smsService.findById(id);
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    return message;
  }
}
