import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  extractVariables(body: string): string[] {
    return [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
  }

  async create(dto: CreateTemplateDto) {
    const variables = this.extractVariables(dto.body);
    return this.prisma.template.create({
      data: {
        name: dto.name,
        body: dto.body,
        variables,
      },
    });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.template.findMany({
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.template.count(),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findById(id);

    const data: { name?: string; body?: string; variables?: string[] } = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.body !== undefined) {
      data.body = dto.body;
      data.variables = this.extractVariables(dto.body);
    }

    return this.prisma.template.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    await this.findById(id);

    // Check if template is used by any active/running campaigns
    const activeCampaign = await this.prisma.campaign.findFirst({
      where: {
        templateId: id,
        status: { notIn: ['DRAFT', 'ABORTED', 'COMPLETED'] },
      },
    });

    if (activeCampaign) {
      throw new BadRequestException(
        `Template is used by an active campaign "${activeCampaign.name}" and cannot be deleted`,
      );
    }

    return this.prisma.template.delete({ where: { id } });
  }
}
