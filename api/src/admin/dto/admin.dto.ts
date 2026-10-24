import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ReportOutcome } from '../../generated/prisma/enums.js';

export class ReportsQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'reviewed'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'reviewed'])
  status: 'open' | 'reviewed' = 'open';
}

export class ResolveReportDto {
  @IsEnum(ReportOutcome)
  outcome: ReportOutcome;
}
