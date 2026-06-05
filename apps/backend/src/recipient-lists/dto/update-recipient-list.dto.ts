import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateRecipientListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
