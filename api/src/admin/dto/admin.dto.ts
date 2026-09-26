import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ReportOutcome } from '../../generated/prisma/enums.js';

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(['open', 'reviewed'])
  status?: 'open' | 'reviewed';
}

export class ResolveReportDto {
  @IsEnum(ReportOutcome)
  outcome: ReportOutcome;
}
