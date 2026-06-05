import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ImportSource } from '@prisma/client';

export class CreateRecipientListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEnum(ImportSource)
  source!: ImportSource;

  @IsOptional()
  @IsString()
  description?: string;
}
