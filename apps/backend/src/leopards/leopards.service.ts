import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

const LEOPARDS_API_URL =
  'https://merchantapi.leopardscourier.com/api/getBookedPacketLastStatus/format/json/';

export interface LeopardsPacket {
  [key: string]: unknown;
}

export interface FetchPacketsParams {
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class LeopardsService {
  private readonly logger = new Logger(LeopardsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  getCredentials(account: number = 1): { apiKey: string; apiPassword: string } | null {
    const keyVar = account === 2 ? 'LEOPARDS_KEY_2' : 'LEOPARDS_KEY';
    const passVar = account === 2 ? 'LEOPARDS_KEY_PASSWORD_2' : 'LEOPARDS_KEY_PASSWORD';
    const apiKey = this.configService.get<string>(keyVar)?.trim();
    const apiPassword = this.configService.get<string>(passVar)?.trim();
    if (!apiKey || !apiPassword) return null;
    return { apiKey, apiPassword };
  }

  async fetchPackets(params?: FetchPacketsParams, account: number = 1): Promise<LeopardsPacket[]> {
    const creds = this.getCredentials(account);
    if (!creds) {
      throw new BadRequestException(
        `Leopards Account ${account} credentials not configured.`,
      );
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const fromDate = params?.fromDate ?? thirtyDaysAgo.toISOString().split('T')[0];
    const toDate = params?.toDate ?? today.toISOString().split('T')[0];

    try {
      this.logger.log(`Fetching Leopards packets: ${fromDate} to ${toDate}`);
      const response = await firstValueFrom(
        this.httpService.request<{
          status?: number | string;
          error?: number | string;
          packet_list?: unknown[] | null;
        }>({
          method: 'GET',
          url: LEOPARDS_API_URL,
          params: {
            api_key: creds.apiKey,
            api_password: creds.apiPassword,
            from_date: fromDate,
            to_date: toDate,
          },
          timeout: 60000,
        }),
      );

      const data = response.data;
      this.logger.log(
        `Leopards response: status=${data?.status}, error=${data?.error}, packet count=${
          Array.isArray(data?.packet_list) ? data.packet_list.length : 0
        }`,
      );

      const status = Number(data?.status);
      if (status !== 1) {
        const errMsg =
          typeof data?.error === 'string' && data.error.length > 0
            ? data.error
            : 'Leopards API returned an error';
        throw new BadRequestException(errMsg);
      }

      const list = data?.packet_list;
      if (!Array.isArray(list) || list.length === 0) return [];

      return list.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        const flat: LeopardsPacket = {};
        for (const [key, value] of Object.entries(item)) {
          flat[key] = value;
        }
        return flat;
      });
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const error = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
        message?: string;
      };
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new BadRequestException('Leopards API credentials are invalid.');
      }
      const message =
        error?.response?.data?.error ??
        error?.response?.data?.message ??
        error?.message ??
        'Failed to fetch Leopards packets';
      throw new BadRequestException(message);
    }
  }
}
