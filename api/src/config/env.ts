import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

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
  @IsString()
  TRUST_PROXY: string = 'loopback';

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
