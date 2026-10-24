import 'reflect-metadata';
import { Transform, plainToInstance } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

export type TrustProxy = false | number | string;

function parseTrustProxy({ value }: { value: string }): TrustProxy {
  const setting = value.trim();
  if (setting === 'false') return false;
  return /^\d+$/.test(setting) ? Number(setting) : setting;
}

function parseFlag({ key, obj }: { key: string; obj: Record<string, unknown> }): unknown {
  const setting = obj[key];
  return setting === 'true' || setting === 'false' ? setting === 'true' : setting;
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

  @Transform(parseTrustProxy, { toClassOnly: true })
  TRUST_PROXY: TrustProxy = 'loopback';

  @IsOptional()
  @IsString()
  METRICS_TOKEN: string = '';

  @Transform(parseFlag, { toClassOnly: true })
  @IsBoolean()
  LOG_JSON: boolean = false;

  @IsOptional()
  @IsString()
  SMTP_URL: string = '';

  @IsOptional()
  @IsString()
  MAIL_FROM: string = 'Matchium <hello@matchium.local>';

  @Transform(({ value }: { value: string }) => value.replace(/\/$/, ''), { toClassOnly: true })
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
  S3_REGION: string = 'us-east-1';

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
