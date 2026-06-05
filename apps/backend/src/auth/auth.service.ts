import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
  }

  async validateAdmin(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string } | null> {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin) return null;

    const passwordMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatch) return null;

    return { id: admin.id, username: admin.username };
  }

  async login(admin: { id: string; username: string }) {
    const payload = { sub: admin.id, username: admin.username };
    const access_token = await this.jwtService.signAsync(payload);
    return { access_token };
  }

  async seedAdmin() {
    const existingAdmin = await this.prisma.admin.findFirst();

    if (existingAdmin) {
      this.logger.log('Admin account already exists');
      return;
    }

    const username =
      this.configService.get<string>('ADMIN_USERNAME') ?? 'admin';
    const password =
      this.configService.get<string>('ADMIN_PASSWORD') ?? 'admin123';

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.admin.create({
      data: { username, passwordHash },
    });

    this.logger.log('Admin account created');
  }
}
