import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RecipientListsService } from './recipient-lists.service';
import { ImportService } from '../import/import.service';
import { CreateRecipientListDto } from './dto/create-recipient-list.dto';
import { UpdateRecipientListDto } from './dto/update-recipient-list.dto';
import { ListImportMapDto } from './dto/list-import-map.dto';

const ALLOWED_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

@Controller('recipient-lists')
export class RecipientListsController {
  constructor(
    private readonly recipientListsService: RecipientListsService,
    private readonly importService: ImportService,
  ) {}

  // ─── CRUD endpoints ───────────────────────────────────────────────────────

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.recipientListsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post()
  create(@Body() dto: CreateRecipientListDto) {
    return this.recipientListsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recipientListsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecipientListDto) {
    return this.recipientListsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.recipientListsService.delete(id);
  }

  // ─── Entry management ─────────────────────────────────────────────────────

  @Get(':id/entries')
  getEntries(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.recipientListsService.getEntries(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search,
    );
  }

  @Post(':id/entries')
  addEntry(
    @Param('id') id: string,
    @Body() body: { phoneNumber: string; variables?: Record<string, unknown> },
  ) {
    return this.recipientListsService.addEntry(id, body.phoneNumber, body.variables);
  }

  @Put(':id/entries/:entryId')
  updateEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() data: { phoneNumber?: string; variables?: Record<string, unknown> },
  ) {
    return this.recipientListsService.updateEntry(id, entryId, data);
  }

  @Delete(':id/entries/:entryId')
  deleteEntry(@Param('id') id: string, @Param('entryId') entryId: string) {
    return this.recipientListsService.deleteEntry(id, entryId);
  }

  @Post(':id/entries/bulk-delete')
  bulkDeleteEntries(
    @Param('id') id: string,
    @Body() body: { entryIds: string[] },
  ) {
    return this.recipientListsService.bulkDeleteEntries(id, body.entryIds);
  }

  @Get(':id/campaigns')
  getCampaignUsage(@Param('id') id: string) {
    return this.recipientListsService.getCampaignUsage(id);
  }

  // ─── Import pipeline ──────────────────────────────────────────────────────

  /** Upload a CSV/XLSX file, parse it, return columns and preview rows */
  @Post(':id/import/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          const name = file.originalname?.toLowerCase() ?? '';
          if (name.endsWith('.csv') || name.endsWith('.xlsx')) {
            cb(null, true);
          } else {
            cb(new BadRequestException('Only CSV and XLSX files are allowed'), false);
          }
        }
      },
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    }),
  )
  async importUpload(
    @Param('id') _id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.importService.parseFile(file);
  }

  /** Validate column mapping against the parsed file (no templateId required) */
  @Post(':id/import/map')
  async importMap(@Param('id') _id: string, @Body() dto: ListImportMapDto) {
    const result = await this.importService.validateAndMap(
      dto.importJobId,
      dto.phoneColumn,
      dto.variableMapping,
      // templateId intentionally omitted — list imports have no template context
    );
    // Store validated recipients so confirm step can write them
    if (result.valid) {
      await this.importService.storeValidatedRecipients(dto.importJobId, result.recipients);
    }
    return result;
  }

  /** Write validated entries into the RecipientListEntry table */
  @Post(':id/import/confirm')
  async importConfirm(
    @Param('id') id: string,
    @Body() body: { importJobId: string },
  ) {
    return this.importService.createListEntries(body.importJobId, id);
  }

  /** Bulk import from PostEx (pre-parsed data delivered by frontend) */
  @Post(':id/import/postex')
  async importPostex(
    @Param('id') id: string,
    @Body() body: { orders: Array<{ phoneNumber: string; variables: Record<string, unknown> }> },
  ) {
    return this.recipientListsService.bulkCreateEntries(id, body.orders);
  }

  /** Bulk import from Google Sheets (pre-parsed data delivered by frontend) */
  @Post(':id/import/sheets')
  async importSheets(
    @Param('id') id: string,
    @Body() body: { rows: Array<{ phoneNumber: string; variables: Record<string, unknown> }> },
  ) {
    return this.recipientListsService.bulkCreateEntries(id, body.rows);
  }
}
