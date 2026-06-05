import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Sensitive keys that should never be returned in bulk read
const SENSITIVE_KEYS = ['google_oauth_refresh_token', 'google_oauth_access_token'];

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private getKey(): Buffer {
    const keyHex = process.env.ENCRYPTION_KEY ?? 'cb1efbd508db5dc3a5f29c39552fa2ca963bb1baa3c9d02980f6a4b638502e6c';
    return Buffer.from(keyHex, 'hex');
  }

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  async get(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) return null;
    try {
      return this.decrypt(setting.value);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const encrypted = this.encrypt(value);
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: encrypted },
      create: { key, value: encrypted },
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.setting.deleteMany({ where: { key } });
  }

  async getAll(): Promise<Record<string, string>> {
    const settings = await this.prisma.setting.findMany({
      where: {
        key: { notIn: SENSITIVE_KEYS },
      },
    });
    const result: Record<string, string> = {};
    for (const setting of settings) {
      try {
        result[setting.key] = this.decrypt(setting.value);
      } catch {
        // Skip keys that fail to decrypt
      }
    }
    return result;
  }
}
