import 'reflect-metadata';
import { isIP } from 'node:net';
import { Transform, plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateBy, validateSync } from 'class-validator';

export type TrustProxy = false | number | string[];

const PROXY_RANGES = ['loopback', 'linklocal', 'uniquelocal'];

function trustProxy({ value }: { value: string }): TrustProxy {
  const setting = value.trim();
  if (setting.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(setting)) return Number(setting);
  return setting.split(',').map((entry) => entry.trim());
}

function isProxy(entry: string): boolean {
  const [address = '', prefix] = entry.split('/');
  return PROXY_RANGES.includes(entry) || (isIP(address) > 0 && (prefix === undefined || /^\d+$/.test(prefix)));
}

function isTrustProxy(value: TrustProxy): boolean {
  return !Array.isArray(value) || value.every(isProxy);
}

export class Env {
  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(8)
  JWT_SECRET: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT: number = 3100;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  QUESTIONS_PER_DAY: number = 6;

  @IsOptional()
  @Transform(trustProxy)
  @ValidateBy({
    name: 'isTrustProxy',
    validator: {
      validate: isTrustProxy,
      defaultMessage: () => 'TRUST_PROXY must be false, a number of hops or a list of addresses',
    },
  })
  TRUST_PROXY: TrustProxy = ['loopback'];

  @IsOptional()
  @IsString()
  METRICS_TOKEN: string = '';

  @IsOptional()
  @IsString()
  SMTP_URL: string = '';

  @IsOptional()
  @IsString()
  MAIL_FROM: string = 'Matchium <hello@matchium.local>';

  @IsOptional()
  @IsString()
  WEB_URL: string = 'http://localhost:3101';

  @IsOptional()
  @IsString()
  S3_ENDPOINT: string = '';

  @IsOptional()
  @IsString()
  S3_BUCKET: string = 'matchium-photos';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY: string = '';

  @IsOptional()
  @IsString()
  S3_SECRET_KEY: string = '';

  @IsOptional()
  @IsString()
  VAPID_PUBLIC_KEY: string = '';

  @IsOptional()
  @IsString()
  VAPID_PRIVATE_KEY: string = '';

  @IsOptional()
  @Matches(/^(mailto:|https:\/\/)/)
  VAPID_SUBJECT: string = 'mailto:push@example.com';
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(`Invalid environment: ${details.join('; ')}`);
  }
  return env;
}
