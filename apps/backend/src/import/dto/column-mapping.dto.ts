import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class ColumnMappingDto {
  @IsString()
  @IsNotEmpty()
  importJobId!: string;

  @IsString()
  @IsNotEmpty()
  phoneColumn!: string;

  @IsObject()
  variableMapping!: Record<string, string>;

  @IsString()
  @IsNotEmpty()
  templateId!: string;
}

export class ConfirmImportDto {
  @IsString()
  @IsNotEmpty()
  importJobId!: string;

  @IsString()
  @IsNotEmpty()
  campaignId!: string;

  @IsOptional()
  @IsString()
  duplicateResolution?: 'keep_first' | 'keep_last';
}
