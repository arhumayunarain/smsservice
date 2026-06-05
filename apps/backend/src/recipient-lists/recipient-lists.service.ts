import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/normalize-phone';
import { CreateRecipientListDto } from './dto/create-recipient-list.dto';
import { UpdateRecipientListDto } from './dto/update-recipient-list.dto';

@Injectable()
export class RecipientListsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.recipientList.findMany({
        include: {
          _count: { select: { entries: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.recipientList.count(),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const list = await this.prisma.recipientList.findUnique({
      where: { id },
      include: {
        _count: { select: { entries: true } },
      },
    });
    if (!list) {
      throw new NotFoundException(`Recipient list ${id} not found`);
    }
    return list;
  }

  async create(dto: CreateRecipientListDto) {
    return this.prisma.recipientList.create({
      data: {
        name: dto.name,
        source: dto.source,
        description: dto.description ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateRecipientListDto) {
    await this.findOne(id); // throws NotFoundException if not found
    return this.prisma.recipientList.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id); // throws NotFoundException if not found

    // Null out recipientListId on campaigns that used this list
    await this.prisma.campaign.updateMany({
      where: { recipientListId: id },
      data: { recipientListId: null },
    });

    // Delete the list — cascade deletes entries
    await this.prisma.recipientList.delete({ where: { id } });
  }

  async getEntries(
    id: string,
    page = 1,
    limit = 50,
    search?: string,
  ) {
    await this.findOne(id); // throws if not found

    const safeLimit = Math.min(limit, 200);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      listId: id,
      ...(search ? { phoneNumber: { contains: search } } : {}),
    };

    const [entries, total] = await Promise.all([
      this.prisma.recipientListEntry.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recipientListEntry.count({ where }),
    ]);

    return {
      entries,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async addEntry(id: string, phoneNumber: string, variables: Record<string, unknown> = {}) {
    await this.findOne(id); // throws if not found

    const { normalized, valid } = normalizePhone(phoneNumber);
    if (!valid || !normalized) {
      throw new Error(`Invalid phone number: "${phoneNumber}"`);
    }

    return this.prisma.recipientListEntry.create({
      data: {
        listId: id,
        phoneNumber: normalized,
        variables: variables as object,
      },
    });
  }

  async updateEntry(
    id: string,
    entryId: string,
    data: { phoneNumber?: string; variables?: Record<string, unknown> },
  ) {
    // Verify entry belongs to this list
    const entry = await this.prisma.recipientListEntry.findFirst({
      where: { id: entryId, listId: id },
    });
    if (!entry) {
      throw new NotFoundException(`Entry ${entryId} not found in list ${id}`);
    }

    let normalizedPhone: string | undefined;
    if (data.phoneNumber !== undefined) {
      const { normalized, valid } = normalizePhone(data.phoneNumber);
      if (!valid || !normalized) {
        throw new Error(`Invalid phone number: "${data.phoneNumber}"`);
      }
      normalizedPhone = normalized;
    }

    return this.prisma.recipientListEntry.update({
      where: { id: entryId },
      data: {
        ...(normalizedPhone !== undefined && { phoneNumber: normalizedPhone }),
        ...(data.variables !== undefined && { variables: data.variables as object }),
      },
    });
  }

  async deleteEntry(id: string, entryId: string) {
    const entry = await this.prisma.recipientListEntry.findFirst({
      where: { id: entryId, listId: id },
    });
    if (!entry) {
      throw new NotFoundException(`Entry ${entryId} not found in list ${id}`);
    }
    await this.prisma.recipientListEntry.delete({ where: { id: entryId } });
  }

  async bulkDeleteEntries(id: string, entryIds: string[]) {
    await this.prisma.recipientListEntry.deleteMany({
      where: {
        id: { in: entryIds },
        listId: id,
      },
    });
  }

  async getCampaignUsage(id: string) {
    await this.findOne(id); // throws if not found
    return this.prisma.campaign.findMany({
      where: { recipientListId: id },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Bulk create entries for PostEx/Sheets imports where data is already pre-parsed
   * by frontend components and passed directly.
   */
  async bulkCreateEntries(
    id: string,
    rows: Array<{ phoneNumber: string; variables: Record<string, unknown> }>,
  ): Promise<{ entryCount: number }> {
    await this.findOne(id); // throws if not found

    const entries = rows.map((row) => {
      const { normalized } = normalizePhone(row.phoneNumber);
      return {
        listId: id,
        phoneNumber: normalized || row.phoneNumber,
        variables: row.variables as object,
      };
    });

    await this.prisma.recipientListEntry.createMany({
      data: entries,
      skipDuplicates: false,
    });

    return { entryCount: entries.length };
  }
}
