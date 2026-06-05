import { IsOptional, IsIn } from 'class-validator';

export class UpdateSimSlotDto {
  @IsOptional()
  @IsIn([0, 1, null])
  simSlot?: number | null;
}
