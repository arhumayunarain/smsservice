import { Controller, Post, Get, Body, BadRequestException } from '@nestjs/common';
import { PostexService } from './postex.service';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ImportSource } from '@prisma/client';

@Controller('postex')
export class PostexController {
  constructor(
    private readonly postexService: PostexService,
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Check if PostEx is configured */
  @Get('status')
  async getStatus() {
    const [token1, token2] = await Promise.all([
      this.settingsService.get('postex_api_token'),
      this.settingsService.get('postex_api_token_2'),
    ]);
    return { configured: !!token1, configured2: !!token2 };
  }

  /** Fetch orders and create ImportJob snapshot */
  @Post('fetch')
  async fetchOrders(
    @Body() body: { templateId?: string; orderStatusID?: number; fromDate?: string; toDate?: string; account?: number },
  ) {
    const tokenKey = body.account === 2 ? 'postex_api_token_2' : 'postex_api_token';
    const token = await this.settingsService.get(tokenKey);
    if (!token) {
      throw new BadRequestException(`PostEx Account ${body.account === 2 ? '2' : '1'} API token not configured.`);
    }

    const orders = await this.postexService.fetchOrders({
      orderStatusID: body.orderStatusID,
      fromDate: body.fromDate,
      toDate: body.toDate,
    }, token);

    if (!orders || orders.length === 0) {
      return {
        importJobId: null,
        headers: [],
        previewRows: [],
        totalRows: 0,
        autoMapping: { phoneColumn: null, variableMapping: {} },
      };
    }

    // Extract headers from the first order's keys
    const headers = Object.keys(orders[0]).filter(Boolean);

    // Convert orders to flat string records
    const allRows: Record<string, string>[] = orders.map((order) => {
      const record: Record<string, string> = {};
      for (const key of headers) {
        const val = order[key];
        if (val === null || val === undefined) {
          record[key] = '';
        } else if (typeof val === 'object') {
          record[key] = JSON.stringify(val);
        } else {
          record[key] = String(val);
        }
      }
      // Trim consigneeName to first name only to keep SMS within 160 chars
      if (record.consigneeName) {
        record.consigneeName = record.consigneeName.split(' ')[0];
      }
      return record;
    });

    // Create ImportJob snapshot with source: POSTEX
    const importJob = await this.prisma.importJob.create({
      data: {
        source: ImportSource.POSTEX,
        rowCount: allRows.length,
        parsedData: allRows as unknown as object,
        metadata: { headers, snapshotAt: new Date().toISOString() },
      },
    });

    // Auto-map if templateId provided
    let autoMapping: { phoneColumn: string | null; variableMapping: Record<string, string | null> } = {
      phoneColumn: null,
      variableMapping: {},
    };

    if (body?.templateId) {
      const template = await this.prisma.template.findUnique({
        where: { id: body.templateId },
        select: { variables: true },
      });
      if (template) {
        autoMapping = this.importService.autoMapColumns(headers, template.variables);
      }
    }

    const previewRows = allRows.slice(0, 5);

    return {
      importJobId: importJob.id,
      headers,
      previewRows,
      totalRows: allRows.length,
      autoMapping,
    };
  }
}
