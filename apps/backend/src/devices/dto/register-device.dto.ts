import { IsString, IsNotEmpty } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
