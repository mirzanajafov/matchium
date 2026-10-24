import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Clock, ageOn } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { priorBelief } from '../engine/belief.js';
import type { PendingSignup, Prisma, User } from '../generated/prisma/client.js';
import { accountExistsEmail, passwordResetEmail, signupEmail, verificationEmail } from '../mail/account-emails.js';
import { Mailer } from '../mail/mailer.js';
import { emailsSent } from '../observability/metrics.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  INVALID_LINK,
  RESET_PURPOSE,
  SIGNUP_LIFETIME_DAYS,
  SIGNUP_PURPOSE,
  VERIFY_PURPOSE,
  passwordStamp,
} from './account-tokens.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { revokeSessions } from './sessions.js';

const MINIMUM_AGE = 18;
const EMAIL_TAKEN = 'This email is already registered';

export interface TokenResponse {
  accessToken: string;
}

export interface CheckEmailResponse {
  checkEmail: true;
}

type Signup = Omit<PendingSignup, 'requestedAt'>;

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
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async onModuleInit() {
    this.decoyHash = await argon2.hash('matchium-decoy-password');
  }

  async register(dto: RegisterDto): Promise<TokenResponse | CheckEmailResponse> {
    const birthDate = new Date(dto.birthDate);
    if (ageOn(birthDate, this.clock.now()) < MINIMUM_AGE) {
      throw new BadRequestException(`You must be at least ${MINIMUM_AGE} to join`);
    }
    const signup: Signup = {
      email: dto.email.toLowerCase(),
      passwordHash: await argon2.hash(dto.password),
      displayName: dto.displayName.trim(),
      birthDate,
      gender: dto.gender,
      seeking: dto.seeking,
      city: dto.city.trim(),
    };
    return this.mailer.enabled ? this.requestSignup(signup) : this.createAndSignIn(signup);
  }

  async confirmSignup(token: string, password: string): Promise<TokenResponse> {
    const { email, stamp } = await this.read<{ email: string; stamp: string }>(token, SIGNUP_PURPOSE);
    const [pending, banned] = await Promise.all([
      this.prisma.pendingSignup.findUnique({ where: { email } }),
      this.isBanned(email),
    ]);
    if (!pending || passwordStamp(pending.passwordHash) !== stamp || banned) {
      throw new GoneException(INVALID_LINK);
    }
    if (!(await argon2.verify(pending.passwordHash, password))) {
      throw new UnauthorizedException('That is not the password you chose when you signed up');
    }
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const taken = await tx.pendingSignup.deleteMany({ where: { email, passwordHash: pending.passwordHash } });
        if (taken.count === 0) throw new GoneException(INVALID_LINK);
        return this.createUser(tx, pending, this.clock.now());
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.prisma.pendingSignup.deleteMany({ where: { email } });
      throw new ConflictException(EMAIL_TAKEN);
    }
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
    await revokeSessions(this.prisma, userId, this.clock.now());
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) throw new ConflictException('Your email is already confirmed');
    this.sendVerification(user);
  }

  async verifyEmail(token: string) {
    const payload = await this.read<{ sub: string; email: string }>(token, VERIFY_PURPOSE);
    const updated = await this.prisma.user.updateMany({
      where: { id: payload.sub, email: payload.email },
      data: { emailVerifiedAt: this.clock.now() },
    });
    if (updated.count === 0) throw new GoneException(INVALID_LINK);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.bannedAt || !this.mailer.enabled) return;
    const token = this.jwt.sign(
      { sub: user.id, purpose: RESET_PURPOSE, stamp: passwordStamp(user.passwordHash) },
      { expiresIn: '30m' },
    );
    void this.deliver(
      'reset',
      user.email,
      passwordResetEmail(user.displayName, `${this.webUrl}/reset-password?token=${token}`),
    );
  }

  async resetPassword(token: string, password: string) {
    const payload = await this.read<{ sub: string; stamp: string }>(token, RESET_PURPOSE);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.bannedAt || passwordStamp(user.passwordHash) !== payload.stamp) {
      throw new GoneException(INVALID_LINK);
    }
    const now = this.clock.now();
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash, bannedAt: null },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
      if (changed.count === 0) throw new GoneException(INVALID_LINK);
      await revokeSessions(tx, user.id, now);
    });
  }

  private async requestSignup(signup: Signup): Promise<CheckEmailResponse> {
    const [banned, owner] = await Promise.all([
      this.isBanned(signup.email),
      this.prisma.user.findUnique({ where: { email: signup.email } }),
    ]);
    if (banned) return { checkEmail: true };
    if (owner) {
      void this.deliver('account-exists', owner.email, accountExistsEmail(owner.displayName, this.webUrl));
    } else {
      const requestedAt = this.clock.now();
      await this.prisma.pendingSignup.upsert({
        where: { email: signup.email },
        create: { ...signup, requestedAt },
        update: { ...signup, requestedAt },
      });
      void this.deliver('signup', signup.email, signupEmail(this.signupUrl(signup), SIGNUP_LIFETIME_DAYS));
    }
    return { checkEmail: true };
  }

  private async createAndSignIn(signup: Signup): Promise<TokenResponse> {
    if (await this.isBanned(signup.email)) throw new ForbiddenException("This email can't be used to sign up");
    let user: User;
    try {
      user = await this.createUser(this.prisma, signup, null);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(EMAIL_TAKEN);
      throw error;
    }
    return this.issue(user.id);
  }

  private createUser(db: Prisma.TransactionClient, signup: Signup, emailVerifiedAt: Date | null) {
    const { email, passwordHash, displayName, birthDate, gender, seeking, city } = signup;
    return db.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        birthDate,
        gender,
        seeking,
        city,
        emailVerifiedAt,
        belief: { create: priorBelief() },
      },
    });
  }

  private async isBanned(email: string): Promise<boolean> {
    const ban = await this.prisma.report.findFirst({
      where: { reportedEmail: email, outcome: 'BANNED' },
      select: { id: true },
    });
    return ban !== null;
  }

  private signupUrl(signup: Signup): string {
    const token = this.jwt.sign(
      { purpose: SIGNUP_PURPOSE, email: signup.email, stamp: passwordStamp(signup.passwordHash) },
      { expiresIn: `${SIGNUP_LIFETIME_DAYS}d` },
    );
    return `${this.webUrl}/confirm-signup?token=${token}`;
  }

  private sendVerification(user: { id: string; email: string; displayName: string }) {
    if (!this.mailer.enabled) return;
    const token = this.jwt.sign({ sub: user.id, purpose: VERIFY_PURPOSE, email: user.email }, { expiresIn: '3d' });
    void this.deliver(
      'verify',
      user.email,
      verificationEmail(user.displayName, `${this.webUrl}/verify-email?token=${token}`),
    );
  }

  private async deliver(kind: string, to: string, mail: { subject: string; text: string; html: string }) {
    try {
      await this.mailer.send({ to, ...mail });
      emailsSent.inc({ kind, result: 'sent' });
    } catch (error) {
      emailsSent.inc({ kind, result: 'failed' });
      this.log.warn(`Account email failed: ${(error as Error).message}`);
    }
  }

  private async read<T extends object>(token: string, purpose: string): Promise<T> {
    let payload: T & { purpose?: string };
    try {
      payload = await this.jwt.verifyAsync<T & { purpose?: string }>(token);
    } catch {
      throw new GoneException(INVALID_LINK);
    }
    if (payload.purpose !== purpose) throw new GoneException(INVALID_LINK);
    return payload;
  }

  private async issue(userId: string): Promise<TokenResponse> {
    const session = await this.prisma.session.create({ data: { userId } });
    return { accessToken: this.jwt.sign({ sub: userId, sid: session.id }) };
  }
}
