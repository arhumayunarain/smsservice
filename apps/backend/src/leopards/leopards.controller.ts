import { Controller, Post, Get, Body } from '@nestjs/common';
import { LeopardsService } from './leopards.service';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportSource } from '@prisma/client';

@Controller('leopards')
export class LeopardsController {
  constructor(
    private readonly leopardsService: LeopardsService,
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
  ) {}

  /** Check if Leopards credentials are configured (in env) */
  @Get('status')
  getStatus() {
    const configured = !!this.leopardsService.getCredentials(1);
    const configured2 = !!this.leopardsService.getCredentials(2);
    return { configured, configured2 };
  }

  /** Fetch packets and create ImportJob snapshot */
  @Post('fetch')
  async fetchPackets(
    @Body() body: { templateId?: string; fromDate?: string; toDate?: string; account?: number },
  ) {
    const account = body.account === 2 ? 2 : 1;
    const packets = await this.leopardsService.fetchPackets({
      fromDate: body.fromDate,
      toDate: body.toDate,
    }, account);

    if (!packets || packets.length === 0) {
      return {
        importJobId: null,
        headers: [],
        previewRows: [],
        totalRows: 0,
        autoMapping: { phoneColumn: null, variableMapping: {} },
      };
    }

    // Build full header set across all packets (Leopards rows can have varying keys)
    const headerSet = new Set<string>();
    for (const p of packets) {
      for (const key of Object.keys(p)) {
        if (key) headerSet.add(key);
      }
    }
    const headers = Array.from(headerSet);

    const allRows: Record<string, string>[] = packets.map((packet) => {
      const record: Record<string, string> = {};
      for (const key of headers) {
        const val = packet[key];
        if (val === null || val === undefined) {
          record[key] = '';
        } else if (typeof val === 'object') {
          record[key] = JSON.stringify(val);
        } else {
          record[key] = String(val);
        }
      }
      // Trim consignment_name_eng to first name only to keep SMS within 160 chars
      if (record.consignment_name_eng) {
        record.consignment_name_eng = record.consignment_name_eng.split(' ')[0];
      }
      return record;
    });

    const importJob = await this.prisma.importJob.create({
      data: {
        source: ImportSource.LEOPARDS,
        rowCount: allRows.length,
        parsedData: allRows as unknown as object,
        metadata: { headers, snapshotAt: new Date().toISOString() },
      },
    });

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
