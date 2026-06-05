import { Injectable, BadRequestException } from '@nestjs/common';
import { google } from 'googleapis';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class GoogleSheetsService {
  constructor(private readonly settingsService: SettingsService) {}

  private async getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/auth/google/callback`,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.settingsService.get('google_access_token'),
      this.settingsService.get('google_refresh_token'),
    ]);

    if (!refreshToken) {
      throw new BadRequestException('Google account not connected. Please connect from the Settings page.');
    }

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Auto-refresh access token using the refresh token
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await this.settingsService.set('google_access_token', tokens.access_token);
      }
    });

    return oauth2Client;
  }

  async listTabs(spreadsheetId: string): Promise<string[]> {
    const auth = await this.getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });

    const sheetTitles =
      response.data.sheets?.map((s) => s.properties?.title ?? '').filter(Boolean) ?? [];

    return sheetTitles;
  }

  async fetchSheetData(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    const auth = await this.getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ`,
    });

    return (response.data.values as string[][]) ?? [];
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.settingsService.delete('google_access_token'),
      this.settingsService.delete('google_refresh_token'),
      this.settingsService.delete('google_email'),
    ]);
  }
}
