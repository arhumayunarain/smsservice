import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return false;
    }

    return this.apiKeyService.validateKey(apiKey);
  }
}
