import {
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class TelemetryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  battery?: number;

  @IsOptional()
  @IsString()
  simCarrier?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  signalStrength?: number;

  @IsOptional()
  @IsString()
  androidVersion?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  networkType?: string;

  @IsOptional()
  @IsArray()
  sims?: Array<{ slot: number; carrier: string; phoneNumber?: string | null }>;
}
