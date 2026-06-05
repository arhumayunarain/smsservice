import { IsOptional, IsInt, Min, IsIn } from 'class-validator';

export class UpdateRateLimitDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  max?: number | null;

  @IsOptional()
  @IsIn(['per_minute', 'per_hour'])
  unit?: string | null;
}
