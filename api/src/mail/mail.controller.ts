import { BadRequestException, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { DigestService } from './digest.service.js';

@ApiTags('email')
@Public()
@Controller('email')
export class MailController {
  constructor(private readonly digest: DigestService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Query('token') token?: string) {
    if (!token || !(await this.digest.unsubscribe(token))) throw new BadRequestException('This link is not valid');
    return { unsubscribed: true };
  }
}
