import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Clock, ageOn } from '../common/clock.js';
import { priorBelief } from '../engine/belief.js';
import { passwordResetEmail, verificationEmail } from '../mail/account-emails.js';
import { Mailer } from '../mail/mailer.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RESET_PURPOSE, VERIFY_PURPOSE, passwordStamp } from './account-tokens.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const MINIMUM_AGE = 18;
const INVALID_LINK = 'This link is not valid';

export interface TokenResponse {
  accessToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger(AuthService.name);
  private readonly webUrl: string;
  private decoyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    config: ConfigService,
  ) {
    this.webUrl = (config.get<string>('WEB_URL') ?? 'http://localhost:3101').replace(/\/$/, '');
  }

  async onModuleInit() {
    this.decoyHash = await argon2.hash('matchium-decoy-password');
  }

  async register(dto: RegisterDto): Promise<TokenResponse> {
    const birthDate = new Date(dto.birthDate);
    if (ageOn(birthDate, this.clock.now()) < MINIMUM_AGE) {
      throw new BadRequestException(`You must be at least ${MINIMUM_AGE} to join`);
    }
    const email = dto.email.toLowerCase();
    const banned = await this.prisma.report.findFirst({ where: { reportedEmail: email, outcome: 'BANNED' } });
    if (banned) throw new ForbiddenException("This email can't be used to sign up");
    let user: { id: string; email: string; displayName: string };
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await argon2.hash(dto.password),
          displayName: dto.displayName.trim(),
          birthDate,
          gender: dto.gender,
          seeking: dto.seeking,
          city: dto.city.trim(),
          belief: { create: priorBelief() },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This email is already registered');
      throw error;
    }
    await this.sendVerification(user);
    return this.issue(user.id);
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const valid = await argon2.verify(user?.passwordHash ?? this.decoyHash, dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (user.bannedAt) throw new ForbiddenException('This account has been suspended');
    return this.issue(user.id);
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async logoutEverywhere(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) throw new ConflictException('Your email is already confirmed');
    await this.sendVerification(user);
  }

  async verifyEmail(token: string) {
    const payload = await this.read<{ sub: string; email: string }>(token, VERIFY_PURPOSE);
    const updated = await this.prisma.user.updateMany({
      where: { id: payload.sub, email: payload.email },
      data: { emailVerifiedAt: this.clock.now() },
    });
    if (updated.count === 0) throw new BadRequestException(INVALID_LINK);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.bannedAt || !this.mailer.enabled) return;
    const token = this.jwt.sign(
      { sub: user.id, purpose: RESET_PURPOSE, stamp: passwordStamp(user.passwordHash) },
      { expiresIn: '30m' },
    );
    await this.deliver(user.email, passwordResetEmail(user.displayName, `${this.webUrl}/reset-password?token=${token}`));
  }

  async resetPassword(token: string, password: string) {
    const payload = await this.read<{ sub: string; stamp: string }>(token, RESET_PURPOSE);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.bannedAt || passwordStamp(user.passwordHash) !== payload.stamp) {
      throw new BadRequestException(INVALID_LINK);
    }
    const now = this.clock.now();
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
      }),
      this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  private async sendVerification(user: { id: string; email: string; displayName: string }) {
    if (!this.mailer.enabled) return;
    const token = this.jwt.sign({ sub: user.id, purpose: VERIFY_PURPOSE, email: user.email }, { expiresIn: '3d' });
    await this.deliver(user.email, verificationEmail(user.displayName, `${this.webUrl}/verify-email?token=${token}`));
  }

  private async deliver(to: string, mail: { subject: string; text: string; html: string }) {
    try {
      await this.mailer.send({ to, ...mail });
    } catch (error) {
      this.log.warn(`Account email failed: ${(error as Error).message}`);
    }
  }

  private async read<T extends object>(token: string, purpose: string): Promise<T> {
    let payload: T & { purpose?: string };
    try {
      payload = await this.jwt.verifyAsync<T & { purpose?: string }>(token);
    } catch {
      throw new BadRequestException(INVALID_LINK);
    }
    if (payload.purpose !== purpose) throw new BadRequestException(INVALID_LINK);
    return payload;
  }

  private async issue(userId: string): Promise<TokenResponse> {
    const session = await this.prisma.session.create({ data: { userId } });
    return { accessToken: this.jwt.sign({ sub: userId, sid: session.id }) };
  }
}
