import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { revokeSessions } from './sessions.js';

export interface TokenResponse {
  accessToken: string;
}

@Injectable()
export class AuthService {
  private readonly decoyHash = argon2.hash('matchium-decoy-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const valid = await argon2.verify(user?.passwordHash ?? (await this.decoyHash), dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (user.bannedAt) throw new ForbiddenException('This account has been suspended');
    return this.startSession(user.id);
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async logoutEverywhere(userId: string) {
    await revokeSessions(this.prisma, userId, this.clock.now());
  }

  async startSession(userId: string): Promise<TokenResponse> {
    const session = await this.prisma.session.create({ data: { userId, createdAt: this.clock.now() } });
    return { accessToken: this.jwt.sign({ sub: userId, sid: session.id }) };
  }
}
