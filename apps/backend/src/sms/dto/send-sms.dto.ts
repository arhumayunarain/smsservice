import {
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1600)
  body!: string;
}
