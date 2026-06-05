import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  body?: string;
}
