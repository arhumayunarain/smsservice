import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body!: string;
}
