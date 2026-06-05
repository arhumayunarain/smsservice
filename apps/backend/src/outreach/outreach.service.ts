import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OutreachSendResult {
  success: boolean;
  transactionId: string | null;
  code: number;
  message: string;
}

export interface OutreachDeliveryStatus {
  transactionId: string;
  number: string;
  date: string;
  status: string;
}

export interface OutreachBalanceResult {
  success: boolean;
  balance: number | null;
  message: string;
}

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);
  private readonly baseUrl = 'http://www.outreach.pk/api/sendsms.php';

  constructor(private readonly config: ConfigService) {}

  private getCredentials() {
    const id = this.config.get<string>('OUTREACH_API_ID');
    const pass = this.config.get<string>('OUTREACH_API_PASS');
    const mask = this.config.get<string>('OUTREACH_MASK') || 'Outreach';

    if (!id || !pass) {
      throw new Error('Outreach API credentials not configured (OUTREACH_API_ID, OUTREACH_API_PASS)');
    }

    return { id, pass, mask };
  }

  isConfigured(): boolean {
    const id = this.config.get<string>('OUTREACH_API_ID');
    const pass = this.config.get<string>('OUTREACH_API_PASS');
    return !!(id && pass);
  }

  /**
   * Send SMS via Outreach API.
   * `to` can be a single number or comma-separated list (format: 923xxxxxxxxx).
   */
  async sendSms(to: string, msg: string): Promise<OutreachSendResult> {
    const { id, pass, mask } = this.getCredentials();

    // Outreach API expects numbers without '+' prefix (e.g. 923xxxxxxxxx)
    const normalizedTo = to.replace(/\+/g, '');

    const params = new URLSearchParams({
      id,
      pass,
      msg,
      to: normalizedTo,
      mask,
      lang: 'English',
      type: 'json',
    });

    const url = `${this.baseUrl}/sendsms/url`;

    this.logger.log(`Sending SMS via Outreach API to ${to}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const text = await response.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        // Outreach sometimes returns XML even when json is requested
        this.logger.warn(`Non-JSON response from Outreach: ${text}`);
        return {
          success: false,
          transactionId: null,
          code: 0,
          message: `Unexpected response: ${text.substring(0, 200)}`,
        };
      }

      // corpsms can be an array or object depending on API version
      const smsData = Array.isArray(data?.corpsms) ? data.corpsms[0] : data?.corpsms;
      const code = parseInt(smsData?.code ?? data?.code ?? '0', 10);
      const type = smsData?.type ?? data?.type ?? '';
      const responseMsg = smsData?.response ?? data?.response ?? '';
      const transactionId = String(smsData?.transactionID ?? data?.transactionID ?? '');

      const success = code === 300 || type === 'Success';

      this.logger.log(
        `Outreach API response: code=${code} type=${type} txn=${transactionId} msg=${responseMsg}`,
      );

      return {
        success,
        transactionId: transactionId || null,
        code,
        message: responseMsg,
      };
    } catch (err) {
      this.logger.error(`Outreach API call failed: ${err}`);
      return {
        success: false,
        transactionId: null,
        code: 0,
        message: `HTTP error: ${err}`,
      };
    }
  }

  /**
   * Check delivery status of a transaction.
   */
  async getDeliveryStatus(transactionId: string): Promise<OutreachDeliveryStatus[] | null> {
    const { id, pass } = this.getCredentials();

    const url = `${this.baseUrl}/delivery/status?id=${encodeURIComponent(id)}&pass=${encodeURIComponent(pass)}&transaction=${encodeURIComponent(transactionId)}`;

    try {
      const response = await fetch(url);
      const text = await response.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // Parse XML response for delivery status
        const statuses: OutreachDeliveryStatus[] = [];
        const statusRegex = /<status num="([^"]*)" date="([^"]*)">([^<]*)<\/status>/g;
        let match: RegExpExecArray | null;
        while ((match = statusRegex.exec(text)) !== null) {
          statuses.push({
            transactionId,
            number: match[1],
            date: match[2],
            status: match[3],
          });
        }
        return statuses.length > 0 ? statuses : null;
      }

      // Handle JSON response
      if (data?.corpsms?.type === 'Error') {
        this.logger.warn(`Delivery status error: ${data.corpsms.response}`);
        return null;
      }

      return data?.corpsms?.transaction
        ? [
            {
              transactionId,
              number: data.corpsms.transaction?.status?.['@num'] ?? '',
              date: data.corpsms.transaction?.status?.['@date'] ?? '',
              status: data.corpsms.transaction?.status?.['#text'] ?? '',
            },
          ]
        : null;
    } catch (err) {
      this.logger.error(`Delivery status check failed: ${err}`);
      return null;
    }
  }

  /**
   * Check account balance.
   */
  async getBalance(): Promise<OutreachBalanceResult> {
    const { id, pass } = this.getCredentials();

    const url = `${this.baseUrl}/balance/status?id=${encodeURIComponent(id)}&pass=${encodeURIComponent(pass)}`;

    try {
      const response = await fetch(url);
      const text = await response.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // Parse XML: <corpsms><code>100</code><type>Success</type><response>5913</response></corpsms>
        const codeMatch = text.match(/<code>(\d+)<\/code>/);
        const responseMatch = text.match(/<response>([^<]*)<\/response>/);
        const code = codeMatch ? parseInt(codeMatch[1], 10) : 0;

        if (code === 100) {
          return {
            success: true,
            balance: responseMatch ? parseInt(responseMatch[1], 10) : null,
            message: 'Success',
          };
        }

        return {
          success: false,
          balance: null,
          message: responseMatch?.[1] ?? 'Unknown error',
        };
      }

      const code = parseInt(data?.corpsms?.code ?? data?.code ?? '0', 10);

      if (code === 100) {
        return {
          success: true,
          balance: parseInt(data?.corpsms?.response ?? data?.response ?? '0', 10),
          message: 'Success',
        };
      }

      return {
        success: false,
        balance: null,
        message: data?.corpsms?.response ?? data?.response ?? 'Unknown error',
      };
    } catch (err) {
      this.logger.error(`Balance check failed: ${err}`);
      return { success: false, balance: null, message: `HTTP error: ${err}` };
    }
  }
}
