import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsObject,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class RecipientDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  // JSON object with variable key-value pairs
  variables!: Record<string, string>;
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsIn(['DEVICE', 'API'])
  sendVia?: 'DEVICE' | 'API';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];

  @IsOptional()
  @IsString()
  recipientListId?: string;

  @IsOptional()
  @IsObject()
  variableMapping?: Record<string, string>; // listColumnName -> templateVariableName

  @IsOptional()
  @IsDateString()
  scheduledAt?: string; // ISO 8601 UTC timestamp

  @IsOptional()
  @IsString()
  timezone?: string; // IANA timezone string for display purposes
}
