import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Clock } from '../common/clock.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { revokeSessions } from './sessions.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

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
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (user.bannedAt) throw new ForbiddenException('This account has been suspended');
    return this.startSession(user);
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

  async startSession(user: Pick<User, 'id' | 'passwordHash'>): Promise<TokenResponse> {
    const [session] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Session" (id, "userId", "createdAt")
      SELECT gen_random_uuid(), id, ${this.clock.now()} FROM "User"
      WHERE id = ${user.id}::uuid AND "passwordHash" = ${user.passwordHash}
      FOR SHARE
      RETURNING id`;
    if (!session) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return { accessToken: this.jwt.sign({ sub: user.id, sid: session.id }) };
  }
}
