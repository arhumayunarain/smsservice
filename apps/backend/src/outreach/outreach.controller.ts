import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { OutreachService } from './outreach.service';

@Controller('outreach')
export class OutreachController {
  constructor(private readonly outreachService: OutreachService) {}

  @Get('balance')
  async getBalance() {
    if (!this.outreachService.isConfigured()) {
      throw new BadRequestException('Outreach API is not configured');
    }
    return this.outreachService.getBalance();
  }

  @Get('delivery-status')
  async getDeliveryStatus(@Query('transactionId') transactionId: string) {
    if (!transactionId) {
      throw new BadRequestException('transactionId is required');
    }
    if (!this.outreachService.isConfigured()) {
      throw new BadRequestException('Outreach API is not configured');
    }
    return this.outreachService.getDeliveryStatus(transactionId);
  }

  @Get('status')
  async getApiStatus() {
    return { configured: this.outreachService.isConfigured() };
  }
}
