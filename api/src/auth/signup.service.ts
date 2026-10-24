import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Clock, ageOn } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { priorBelief } from '../engine/belief.js';
import type { PendingSignup, Prisma, User } from '../generated/prisma/client.js';
import { accountExistsEmail, signupEmail } from '../mail/emails.js';
import { Mailer } from '../mail/mailer.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, type TokenResponse } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { INVALID_LINK, PurposeTokens, SIGNUP_LIFETIME_DAYS, passwordStamp } from './purpose-tokens.js';

const MINIMUM_AGE = 18;
const EMAIL_TAKEN = 'This email is already registered';

export interface CheckEmailResponse {
  checkEmail: true;
}

type Signup = Omit<PendingSignup, 'requestedAt'>;

@Injectable()
export class SignupService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    private readonly tokens: PurposeTokens,
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
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
    return this.mailer.enabled ? this.request(signup) : this.createAndSignIn(signup);
  }

  async confirm(token: string, password: string): Promise<TokenResponse> {
    const { email, stamp } = await this.tokens.read(token, 'confirm-signup');
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
    return this.auth.startSession(user.id);
  }

  private async request(signup: Signup): Promise<CheckEmailResponse> {
    const [banned, owner] = await Promise.all([
      this.isBanned(signup.email),
      this.prisma.user.findUnique({ where: { email: signup.email } }),
    ]);
    if (banned) return { checkEmail: true };
    if (owner) {
      const mail = accountExistsEmail(owner.displayName, this.webUrl);
      void this.mailer.deliver('account-exists', { to: owner.email, ...mail });
    } else {
      const requestedAt = this.clock.now();
      await this.prisma.pendingSignup.upsert({
        where: { email: signup.email },
        create: { ...signup, requestedAt },
        update: { ...signup, requestedAt },
      });
      const token = this.tokens.sign('confirm-signup', {
        email: signup.email,
        stamp: passwordStamp(signup.passwordHash),
      });
      const mail = signupEmail(`${this.webUrl}/confirm-signup?token=${token}`, SIGNUP_LIFETIME_DAYS);
      void this.mailer.deliver('signup', { to: signup.email, ...mail });
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
    return this.auth.startSession(user.id);
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
}
