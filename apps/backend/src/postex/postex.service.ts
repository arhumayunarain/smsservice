import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

const POSTEX_API_URL = 'https://api.postex.pk/services/integration/api/order/v1/get-all-order';

export interface PostexOrder {
  [key: string]: unknown;
}

export interface FetchOrdersParams {
  orderStatusID?: number;
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class PostexService {
  private readonly logger = new Logger(PostexService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly settingsService: SettingsService,
  ) {}

  async fetchOrders(params?: FetchOrdersParams, tokenOverride?: string): Promise<PostexOrder[]> {
    const token = tokenOverride ?? await this.settingsService.get('postex_api_token');
    if (!token) {
      throw new BadRequestException('PostEx API token not configured. Please add it in Settings.');
    }

    // Default: all statuses (0), last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orderStatusID = params?.orderStatusID ?? 0;
    const fromDate = params?.fromDate ?? thirtyDaysAgo.toISOString().split('T')[0];
    const toDate = params?.toDate ?? today.toISOString().split('T')[0];

    try {
      // PostEx List Orders API: GET with token header and query params
      this.logger.log(`Fetching PostEx orders: statusId=${orderStatusID}, ${fromDate} to ${toDate}`);
      const response = await firstValueFrom(
        this.httpService.request<{ statusCode?: string; statusMessage?: string; dist?: unknown[] }>({
          method: 'GET',
          url: POSTEX_API_URL,
          headers: {
            token: token,
          },
          params: {
            orderStatusId: orderStatusID,
            startDate: fromDate,
            endDate: toDate,
          },
          timeout: 30000,
        }),
      );
      this.logger.log(`PostEx response: statusCode=${response.data?.statusCode}, dist count=${response.data?.dist?.length ?? 0}`);

      const dist = response.data?.dist;
      if (!Array.isArray(dist) || dist.length === 0) {
        return [];
      }

      // Response shape: dist[].trackingResponse contains order fields
      // dist[].trackingNumber and dist[].message are top-level
      return dist.map((entry: unknown) => {
        const item = entry as Record<string, unknown>;
        const tracking = (item?.trackingResponse ?? item) as Record<string, unknown>;
        const flat: PostexOrder = {};

        // Include trackingNumber from top level if present
        if (item?.trackingNumber) {
          flat.trackingNumber = item.trackingNumber;
        }

        // Flatten trackingResponse fields
        if (typeof tracking === 'object' && tracking !== null) {
          for (const [key, value] of Object.entries(tracking)) {
            flat[key] = value;
          }
        }

        return flat;
      });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string; statusMessage?: string } }; message?: string };
      if (error?.response?.status === 401) {
        throw new BadRequestException('PostEx API token is invalid or expired.');
      }
      const message =
        error?.response?.data?.statusMessage ??
        error?.response?.data?.message ??
        error?.message ??
        'Failed to fetch PostEx orders';
      throw new BadRequestException(message);
    }
  }
}
