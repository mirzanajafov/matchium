import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export const MAX_BIO = 300;

export class ProfileDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAX_BIO)
  bio: string;
}
