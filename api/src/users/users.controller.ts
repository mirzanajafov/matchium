import { Body, Controller, Delete, Get, HttpCode, Header, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { AccountService } from './account.service.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { PreferencesDto } from './dto/preferences.dto.js';
import { ProfileDto } from './dto/profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly account: AccountService,
  ) {}

  @Get()
  me(@CurrentUser() { id }: AuthUser) {
    return this.users.profile(id);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() { id }: AuthUser) {
    return this.account.export(id);
  }

  @Patch('profile')
  profile(@CurrentUser() { id }: AuthUser, @Body() dto: ProfileDto) {
    return this.users.setBio(id, dto.bio);
  }

  @Patch('preferences')
  preferences(@CurrentUser() { id }: AuthUser, @Body() dto: PreferencesDto) {
    return this.users.setEmailDigest(id, dto.emailDigest);
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() { id }: AuthUser, @Body() dto: DeleteAccountDto) {
    await this.account.delete(id, dto.password);
  }
}
