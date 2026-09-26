import { Transform, Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ReportReason } from '../../generated/prisma/enums.js';

export class ReportDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UnmatchDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportDto)
  report?: ReportDto;
}
