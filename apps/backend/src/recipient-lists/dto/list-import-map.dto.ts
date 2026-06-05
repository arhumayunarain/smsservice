import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class ListImportMapDto {
  @IsString()
  @IsNotEmpty()
  importJobId!: string;

  @IsString()
  @IsNotEmpty()
  phoneColumn!: string;

  @IsObject()
  variableMapping!: Record<string, string>;
}
