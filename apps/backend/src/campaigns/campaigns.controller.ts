import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(dto);
  }

  @Get()
  findAll() {
    return this.campaignsService.findAll();
  }

  // GET /campaigns/history — must come BEFORE :id to avoid Express treating "history" as an ID
  @Get('history')
  getCampaignHistory(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.campaignsService.getCampaignHistory(parsedLimit);
  }

  // POST /campaigns/test-send must come BEFORE :id to avoid route conflict
  @Post('test-send')
  testSend(
    @Body()
    body: {
      recipient: string;
      templateBody: string;
      variables: Record<string, string>;
    },
  ) {
    return this.campaignsService.testSend(
      body.recipient,
      body.templateBody,
      body.variables,
    );
  }

  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  clone(@Param('id') id: string) {
    return this.campaignsService.clone(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.campaignsService.findById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.campaignsService.delete(id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  sendNow(@Param('id') id: string) {
    return this.campaignsService.sendNow(id);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  schedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string; timezone: string },
  ) {
    return this.campaignsService.schedule(id, new Date(body.scheduledAt));
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id') id: string) {
    return this.campaignsService.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id') id: string) {
    return this.campaignsService.resume(id);
  }

  @Post(':id/abort')
  @HttpCode(HttpStatus.OK)
  abort(@Param('id') id: string) {
    return this.campaignsService.abort(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string) {
    return this.campaignsService.retryFailed(id);
  }

  @Get(':id/progress')
  getProgress(@Param('id') id: string) {
    return this.campaignsService.getProgress(id);
  }

  @Get(':id/queue-stats')
  getQueueStats(@Param('id') id: string) {
    return this.campaignsService.getQueueStats(id);
  }
}
