import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ApiKeyService } from './api-key.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Skip WebSocket connections — they use their own handshake auth
    if (context.getType() === 'ws') {
      return true;
    }

    // Check for API key first (x-api-key header)
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      return this.apiKeyService.validateKey(apiKey);
    }

    // Fall back to JWT
    return super.canActivate(context) as Promise<boolean>;
  }
}
