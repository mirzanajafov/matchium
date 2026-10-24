import { Controller, GoneException, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { INVALID_LINK } from '../auth/account-tokens.js';
import { TokenDto } from '../auth/dto/account.dto.js';
import { Public } from '../auth/public.decorator.js';
import { DigestService } from './digest.service.js';

@ApiTags('email')
@Public()
@Controller('email')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Query() query: TokenDto) {
    if (!(await this.digest.unsubscribe(query.token))) throw new GoneException(INVALID_LINK);
    return { unsubscribed: true };
  }
}
