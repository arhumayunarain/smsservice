import { IsOptional, IsString, IsIn, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageFilterDto {
  @IsOptional() @IsString() campaignId?: string;
  @IsOptional() @IsIn(['PENDING', 'QUEUED', 'SENT_TO_DEVICE', 'DELIVERED', 'FAILED']) status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
