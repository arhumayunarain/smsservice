import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async generateKey(name: string): Promise<{
    id: string;
    name: string;
    keyPrefix: string;
    rawKey: string;
  }> {
    const rawKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 10);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        active: true,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      rawKey,
    };
  }

  async validateKey(rawKey: string): Promise<boolean> {
    if (!rawKey || !rawKey.startsWith('sk_')) return false;

    const keyPrefix = rawKey.substring(0, 10);

    const candidates = await this.prisma.apiKey.findMany({
      where: { keyPrefix, active: true },
    });

    for (const candidate of candidates) {
      const match = await bcrypt.compare(rawKey, candidate.keyHash);
      if (match) {
        // Update lastUsed timestamp
        await this.prisma.apiKey.update({
          where: { id: candidate.id },
          data: { lastUsed: new Date() },
        });
        return true;
      }
    }

    return false;
  }

  async listKeys() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        active: true,
        createdAt: true,
        lastUsed: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateKey(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { active: false },
    });
  }

  async deleteKey(id: string) {
    return this.prisma.apiKey.delete({ where: { id } });
  }
}
