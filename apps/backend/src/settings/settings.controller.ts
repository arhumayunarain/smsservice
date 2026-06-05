import { Controller, Get, Put, Delete, Body, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAll(): Promise<Record<string, string>> {
    return this.settingsService.getAll();
  }

  @Put()
  async update(@Body() dto: UpdateSettingDto): Promise<{ success: boolean }> {
    await this.settingsService.set(dto.key, dto.value);
    return { success: true };
  }

  /** Save PostEx API token (account 1 or 2) */
  @Put('postex')
  async savePostexToken(@Body() body: { apiToken: string; account?: number }): Promise<{ success: boolean }> {
    if (!body?.apiToken) {
      throw new BadRequestException('apiToken is required');
    }
    const key = body.account === 2 ? 'postex_api_token_2' : 'postex_api_token';
    await this.settingsService.set(key, body.apiToken);
    return { success: true };
  }

  /** Delete PostEx API token (account 1 or 2) */
  @Delete('postex')
  async deletePostexToken(@Body() body?: { account?: number }): Promise<{ success: boolean }> {
    const key = body?.account === 2 ? 'postex_api_token_2' : 'postex_api_token';
    await this.settingsService.delete(key);
    return { success: true };
  }

  /** Delete Google OAuth tokens (disconnect) */
  @Delete('google')
  async disconnectGoogle(): Promise<{ success: boolean }> {
    await Promise.all([
      this.settingsService.delete('google_access_token'),
      this.settingsService.delete('google_refresh_token'),
      this.settingsService.delete('google_email'),
    ]);
    return { success: true };
  }
}
