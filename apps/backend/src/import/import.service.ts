import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ImportSource } from '@prisma/client';
import { normalizePhone } from '../common/normalize-phone';

// Phone number headers to look for
const PHONE_HEADERS = ['phone', 'phone_number', 'mobile', 'contact', 'number', 'tel', 'cell', 'phonenumber', 'mobile_number', 'msisdn'];

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  // RichTextValue
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('').trim();
  }
  // Formula result
  if (typeof value === 'object' && 'result' in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    if (result === null || result === undefined) return '';
    return String(result).trim();
  }
  return String(value).trim();
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async parseFile(file: Express.Multer.File): Promise<{
    importJobId: string;
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
  }> {
    const isXlsx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname?.toLowerCase().endsWith('.xlsx');

    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname?.toLowerCase().endsWith('.csv');

    if (!isXlsx && !isCsv) {
      throw new BadRequestException('Unsupported file format. Only CSV and XLSX are allowed.');
    }

    const source: ImportSource = isXlsx ? ImportSource.XLSX : ImportSource.CSV;

    // Parse with ExcelJS
    const workbook = new ExcelJS.Workbook();
    if (isXlsx) {
      // Convert Node.js Buffer to ArrayBuffer for ExcelJS compatibility
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength,
      ) as ArrayBuffer;
      await workbook.xlsx.load(arrayBuffer);
    } else {
      // CSV parsing
      const stream = Readable.from(file.buffer);
      await workbook.csv.read(stream);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('No worksheets found in file.');
    }

    // Extract headers from row 1 (ExcelJS is 1-indexed; row.values[0] is undefined)
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => {
      headers.push(cellValueToString(cell.value));
    });

    if (headers.length === 0) {
      throw new BadRequestException('No headers found in file.');
    }

    // Extract all data rows
    const allRows: Record<string, string>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rowData: Record<string, string> = {};
      let hasData = false;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          const val = cellValueToString(cell.value);
          rowData[header] = val;
          if (val) hasData = true;
        }
      });
      if (hasData) {
        allRows.push(rowData);
      }
    });

    // Store in ImportJob
    const importJob = await this.prisma.importJob.create({
      data: {
        source,
        fileName: file.originalname,
        rowCount: allRows.length,
        parsedData: allRows as unknown as object,
        metadata: { headers },
      },
    });

    const previewRows = allRows.slice(0, 5);
    return {
      importJobId: importJob.id,
      headers,
      previewRows,
      totalRows: allRows.length,
    };
  }

  autoMapColumns(
    headers: string[],
    variables: string[],
  ): { phoneColumn: string | null; variableMapping: Record<string, string | null> } {
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    // Find phone column
    let phoneColumn: string | null = null;
    for (const phoneHeader of PHONE_HEADERS) {
      const idx = lowerHeaders.indexOf(phoneHeader);
      if (idx !== -1) {
        phoneColumn = headers[idx];
        break;
      }
    }
    // Partial match fallback
    if (!phoneColumn) {
      const idx = lowerHeaders.findIndex((h) =>
        PHONE_HEADERS.some((ph) => h.includes(ph)),
      );
      if (idx !== -1) phoneColumn = headers[idx];
    }

    // Map variables
    const variableMapping: Record<string, string | null> = {};
    for (const variable of variables) {
      const lowerVar = variable.toLowerCase();
      // Exact case-insensitive match
      let idx = lowerHeaders.indexOf(lowerVar);
      if (idx !== -1) {
        variableMapping[variable] = headers[idx];
        continue;
      }
      // Contains match
      idx = lowerHeaders.findIndex(
        (h) => h.includes(lowerVar) || lowerVar.includes(h),
      );
      if (idx !== -1) {
        variableMapping[variable] = headers[idx];
        continue;
      }
      variableMapping[variable] = null;
    }

    return { phoneColumn, variableMapping };
  }

  async validateAndMap(
    importJobId: string,
    phoneColumn: string,
    variableMapping: Record<string, string>,
    templateId?: string,
  ): Promise<{
    valid: boolean;
    recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>;
    errors: Array<{ row: number; field: string; message: string }>;
    duplicates: Array<{ phoneNumber: string; rows: number[] }>;
    autoMapping?: { phoneColumn: string | null; variableMapping: Record<string, string | null> };
  }> {
    const importJob = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
    });
    if (!importJob) {
      throw new NotFoundException(`Import job ${importJobId} not found`);
    }

    const parsedRows = (importJob.parsedData as Record<string, string>[]) ?? [];
    const headers = Object.keys(parsedRows[0] ?? {});

    let autoMapping: { phoneColumn: string | null; variableMapping: Record<string, string | null> } | undefined;

    if (templateId) {
      // Template-based path: get template variables for auto-mapping
      const template = await this.prisma.template.findUnique({
        where: { id: templateId },
        select: { variables: true },
      });
      if (!template) {
        throw new NotFoundException(`Template ${templateId} not found`);
      }
      autoMapping = this.autoMapColumns(headers, template.variables);
    }
    // When templateId is absent (list import): skip template lookup entirely

    const recipients: Array<{ phoneNumber: string; variables: Record<string, string> }> = [];
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const phoneOccurrences: Record<string, number[]> = {};

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const rowNum = i + 2; // 1-indexed, row 1 is header

      // Normalize phone
      const rawPhone = row[phoneColumn] ?? '';
      const { normalized, valid: phoneValid } = normalizePhone(rawPhone);

      if (!phoneValid || !normalized) {
        errors.push({
          row: rowNum,
          field: 'phoneNumber',
          message: `Invalid phone number: "${rawPhone}"`,
        });
        continue;
      }

      // Extract variables
      const variables: Record<string, string> = {};
      let hasVariableError = false;

      if (templateId) {
        // Template-based: validate against template variable mapping (existing behavior)
        for (const [variable, column] of Object.entries(variableMapping)) {
          if (!column) {
            errors.push({
              row: rowNum,
              field: variable,
              message: `No column mapped for variable "${variable}"`,
            });
            hasVariableError = true;
            continue;
          }
          const value = row[column] ?? '';
          if (!value) {
            errors.push({
              row: rowNum,
              field: variable,
              message: `Missing value for "${variable}" in column "${column}"`,
            });
            hasVariableError = true;
            continue;
          }
          variables[variable] = value;
        }
      } else {
        // List import path: no template validation
        const mappingEntries = Object.entries(variableMapping);
        if (mappingEntries.length > 0) {
          // Use provided mapping: key = target variable name, value = source column name
          for (const [variable, column] of mappingEntries) {
            if (column) {
              variables[variable] = row[column] ?? '';
            }
          }
        } else {
          // No mapping provided: store ALL non-phone columns as variables
          for (const [key, value] of Object.entries(row)) {
            if (key !== phoneColumn) {
              variables[key] = value;
            }
          }
        }
      }

      if (hasVariableError) continue;

      // Track phone for duplicate detection
      if (!phoneOccurrences[normalized]) {
        phoneOccurrences[normalized] = [];
      }
      phoneOccurrences[normalized].push(rowNum);

      recipients.push({ phoneNumber: normalized, variables });
    }

    // Detect duplicates
    const duplicates = Object.entries(phoneOccurrences)
      .filter(([, rows]) => rows.length > 1)
      .map(([phoneNumber, rows]) => ({ phoneNumber, rows }));

    const valid = errors.length === 0;
    return { valid, recipients, errors, duplicates, autoMapping };
  }

  async createListEntries(
    importJobId: string,
    listId: string,
  ): Promise<{ entryCount: number }> {
    const importJob = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
    });
    if (!importJob) {
      throw new NotFoundException(`Import job ${importJobId} not found`);
    }

    const metadata = importJob.metadata as {
      validatedRecipients?: Array<{ phoneNumber: string; variables: Record<string, string> }>;
    };
    const recipients = metadata?.validatedRecipients ?? [];

    await this.prisma.recipientListEntry.createMany({
      data: recipients.map((r) => ({
        listId,
        phoneNumber: r.phoneNumber,
        variables: r.variables,
      })),
      skipDuplicates: false,
    });

    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'COMPLETED',
        rowCount: recipients.length,
      },
    });

    return { entryCount: recipients.length };
  }

  async createRecipients(
    importJobId: string,
    campaignId: string,
    duplicateResolution?: 'keep_first' | 'keep_last',
  ): Promise<{ recipientCount: number }> {
    const importJob = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
    });
    if (!importJob) {
      throw new NotFoundException(`Import job ${importJobId} not found`);
    }

    const metadata = importJob.metadata as {
      validatedRecipients?: Array<{ phoneNumber: string; variables: Record<string, string> }>;
    };
    let recipients = metadata?.validatedRecipients ?? [];

    // Apply duplicate resolution
    if (duplicateResolution && recipients.length > 0) {
      const seen = new Map<string, number>();
      const resolved: typeof recipients = [];
      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        if (seen.has(r.phoneNumber)) {
          if (duplicateResolution === 'keep_last') {
            // Remove previous occurrence
            const prevIdx = seen.get(r.phoneNumber)!;
            resolved[prevIdx] = r;
            seen.set(r.phoneNumber, prevIdx);
          }
          // keep_first: skip this one
        } else {
          seen.set(r.phoneNumber, resolved.length);
          resolved.push(r);
        }
      }
      recipients = resolved.filter(Boolean);
    }

    await this.prisma.campaignRecipient.createMany({
      data: recipients.map((r) => ({
        campaignId,
        phoneNumber: r.phoneNumber,
        variables: r.variables,
      })),
      skipDuplicates: false,
    });

    // Update import job status
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'COMPLETED',
        campaignId,
        rowCount: recipients.length,
      },
    });

    return { recipientCount: recipients.length };
  }

  async storeValidatedRecipients(
    importJobId: string,
    recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>,
  ): Promise<void> {
    const importJob = await this.prisma.importJob.findUnique({
      where: { id: importJobId },
    });
    if (!importJob) {
      throw new NotFoundException(`Import job ${importJobId} not found`);
    }
    const existingMetadata = (importJob.metadata as Record<string, unknown>) ?? {};
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'PROCESSING',
        metadata: {
          ...existingMetadata,
          validatedRecipients: recipients,
        },
      },
    });
  }
}
