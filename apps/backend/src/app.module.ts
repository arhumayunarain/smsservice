import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { DevicesModule } from './devices/devices.module';
import { GatewayModule } from './gateway/gateway.module';
import { SmsModule } from './sms/sms.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TemplatesModule } from './templates/templates.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { SettingsModule } from './settings/settings.module';
import { ImportModule } from './import/import.module';
import { GoogleSheetsModule } from './google-sheets/google-sheets.module';
import { PostexModule } from './postex/postex.module';
import { LeopardsModule } from './leopards/leopards.module';
import { RecipientListsModule } from './recipient-lists/recipient-lists.module';
import { OutreachModule } from './outreach/outreach.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    DevicesModule,
    GatewayModule,
    SmsModule,
    TemplatesModule,
    CampaignsModule,
    SettingsModule,
    ImportModule,
    GoogleSheetsModule,
    PostexModule,
    LeopardsModule,
    RecipientListsModule,
    OutreachModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
