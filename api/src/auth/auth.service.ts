import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Clock, ageOn } from '../common/clock.js';
import { priorBelief } from '../engine/belief.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const MINIMUM_AGE = 18;

export interface TokenResponse {
  accessToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private decoyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  async onModuleInit() {
    this.decoyHash = await argon2.hash('matchium-decoy-password');
  }

  async register(dto: RegisterDto): Promise<TokenResponse> {
    const birthDate = new Date(dto.birthDate);
    if (ageOn(birthDate, this.clock.now()) < MINIMUM_AGE) {
      throw new BadRequestException(`You must be at least ${MINIMUM_AGE} to join`);
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: await argon2.hash(dto.password),
          displayName: dto.displayName.trim(),
          birthDate,
          gender: dto.gender,
          seeking: dto.seeking,
          city: dto.city.trim(),
          belief: { create: priorBelief() },
        },
      });
      return this.issue(user.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This email is already registered');
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const valid = await argon2.verify(user?.passwordHash ?? this.decoyHash, dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (user.bannedAt) throw new ForbiddenException('This account has been suspended');
    return this.issue(user.id);
  }

  private issue(userId: string): TokenResponse {
    return { accessToken: this.jwt.sign({ sub: userId }) };
  }
}
