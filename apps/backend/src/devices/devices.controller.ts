import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { UpdateSimSlotDto } from './dto/update-sim-slot.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(dto.name);
  }

  @Get()
  async findAll() {
    return this.devicesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const device = await this.devicesService.findById(id);
    if (!device) {
      throw new NotFoundException(`Device ${id} not found`);
    }
    return device;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    const device = await this.devicesService.findById(id);
    if (!device) {
      throw new NotFoundException(`Device ${id} not found`);
    }
    await this.devicesService.remove(id);
  }

  @Patch(':id/rate-limit')
  @HttpCode(HttpStatus.OK)
  async updateRateLimit(
    @Param('id') id: string,
    @Body() dto: UpdateRateLimitDto,
  ) {
    const device = await this.devicesService.findById(id);
    if (!device) {
      throw new NotFoundException(`Device ${id} not found`);
    }
    await this.devicesService.updateRateLimit(id, dto.max ?? null, dto.unit as 'per_minute' | 'per_hour' | null ?? null);
    return { success: true, rateLimitMax: dto.max ?? null, rateLimitUnit: dto.unit ?? null };
  }

  @Patch(':id/sim-slot')
  @HttpCode(HttpStatus.OK)
  async updateSimSlot(
    @Param('id') id: string,
    @Body() dto: UpdateSimSlotDto,
  ) {
    const device = await this.devicesService.findById(id);
    if (!device) {
      throw new NotFoundException(`Device ${id} not found`);
    }
    await this.devicesService.updateSimSlot(id, dto.simSlot ?? null);
    return { success: true, simSlot: dto.simSlot ?? null };
  }
}
