import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { AdminOnly } from '../auth/public.decorator.js';
import { AdminService } from './admin.service.js';
import { ReportsQueryDto, ResolveReportDto } from './dto/admin.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  reports(@Query() query: ReportsQueryDto) {
    return this.admin.reports(query.status ?? 'open');
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolve(user.id, id, dto.outcome);
  }
}
