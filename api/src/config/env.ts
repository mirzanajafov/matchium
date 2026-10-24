import 'reflect-metadata';
import { Transform, plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

export type TrustProxy = boolean | number | string;

function trustProxy({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const setting = value.trim();
  if (setting === 'true' || setting === 'false') return setting === 'true';
  return /^\d+$/.test(setting) ? Number(setting) : setting;
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
  TRUST_PROXY: TrustProxy = 'loopback';

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
