import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly settingsService: SettingsService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL: `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/auth/google/callback`,
      scope: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'email', 'profile'],
      passReqToCallback: false,
    });
  }

  authorizationParams(): Record<string, string> {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: { emails?: Array<{ value: string }> },
    done: VerifyCallback,
  ): Promise<void> {
    try {
      // Store tokens encrypted in Settings
      await this.settingsService.set('google_access_token', accessToken);
      if (refreshToken) {
        await this.settingsService.set('google_refresh_token', refreshToken);
      }
      const email = profile.emails?.[0]?.value ?? '';
      await this.settingsService.set('google_email', email);
      done(null, { accessToken, email });
    } catch (err) {
      done(err as Error);
    }
  }
}
