import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { GoogleSheetsService } from './google-sheets.service';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ImportSource } from '@prisma/client';

@Controller()
export class GoogleSheetsController {
  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Initiates OAuth2 flow — redirects to Google consent screen */
  @Public()
  @Get('auth/google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard handles redirect
  }

  /** OAuth callback — Google redirects here after consent */
  @Public()
  @Get('auth/google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Res() res: Response) {
    const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3001';
    res.redirect(`${dashboardUrl}/settings?google=connected`);
  }

  /** Check Google connection status */
  @Get('auth/google/status')
  async googleStatus() {
    const refreshToken = await this.settingsService.get('google_refresh_token');
    const email = await this.settingsService.get('google_email');
    return {
      connected: !!refreshToken,
      email: email ?? undefined,
    };
  }

  /** Disconnect Google account */
  @Delete('auth/google')
  async googleDisconnect() {
    await this.googleSheetsService.disconnect();
    return { success: true };
  }

  /** List sheet tabs for a spreadsheet */
  @Get('sheets/:spreadsheetId/tabs')
  async listTabs(@Param('spreadsheetId') spreadsheetId: string) {
    const tabs = await this.googleSheetsService.listTabs(spreadsheetId);
    return { tabs };
  }

  /** Fetch sheet data, create ImportJob, run auto-mapping */
  @Post('sheets/:spreadsheetId/data')
  async fetchSheetData(
    @Param('spreadsheetId') spreadsheetId: string,
    @Body() body: { sheetName: string; templateId?: string },
  ) {
    const { sheetName, templateId } = body;

    if (!sheetName) {
      throw new BadRequestException('sheetName is required');
    }
    // templateId is now optional — list imports call this without a templateId

    // Fetch raw sheet data
    const rawData = await this.googleSheetsService.fetchSheetData(spreadsheetId, sheetName);

    if (!rawData || rawData.length === 0) {
      throw new BadRequestException('Sheet is empty or has no data.');
    }

    // Row 0 = headers
    const headers = rawData[0].map((h) => String(h ?? '').trim()).filter(Boolean);

    if (headers.length === 0) {
      throw new BadRequestException('No headers found in sheet row 1.');
    }

    // Convert to records
    const allRows: Record<string, string>[] = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const record: Record<string, string> = {};
      let hasData = false;
      headers.forEach((header, colIdx) => {
        const val = String(row[colIdx] ?? '').trim();
        record[header] = val;
        if (val) hasData = true;
      });
      if (hasData) allRows.push(record);
    }

    // Create ImportJob with source: SHEETS
    const importJob = await this.prisma.importJob.create({
      data: {
        source: ImportSource.SHEETS,
        rowCount: allRows.length,
        parsedData: allRows as unknown as object,
        metadata: { headers, spreadsheetId, sheetName },
      },
    });

    const previewRows = allRows.slice(0, 5);

    // Auto-mapping only available when templateId is provided
    let autoMapping: { phoneColumn: string | null; variableMapping: Record<string, string | null> } | undefined;
    if (templateId) {
      const template = await this.prisma.template.findUnique({
        where: { id: templateId },
        select: { variables: true },
      });

      autoMapping = template
        ? this.importService.autoMapColumns(headers, template.variables)
        : { phoneColumn: null, variableMapping: {} };
    }

    return {
      importJobId: importJob.id,
      headers,
      previewRows,
      totalRows: allRows.length,
      ...(autoMapping !== undefined && { autoMapping }),
    };
  }
}
