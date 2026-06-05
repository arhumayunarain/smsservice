import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UnauthorizedException,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { LoginDto } from './dto/login.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { Public } from './decorators/public.decorator';

interface RequestWithUser extends Request {
  user: { userId: string; username: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const admin = await this.authService.validateAdmin(
      dto.username,
      dto.password,
    );
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(admin);
  }

  @Get('me')
  getMe(@Request() req: RequestWithUser) {
    return { userId: req.user.userId, username: req.user.username };
  }

  @Post('api-keys')
  createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.generateKey(dto.name);
  }

  @Get('api-keys')
  listApiKeys() {
    return this.apiKeyService.listKeys();
  }

  @Delete('api-keys/:id')
  deleteApiKey(@Param('id') id: string) {
    return this.apiKeyService.deleteKey(id);
  }
}
