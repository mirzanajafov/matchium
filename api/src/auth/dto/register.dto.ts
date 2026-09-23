import { ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsEmail, IsEnum, IsString, Length } from 'class-validator';
import { Gender } from '../../generated/prisma/enums.js';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @Length(1, 40)
  displayName: string;

  @IsDateString({ strict: true })
  birthDate: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Gender, { each: true })
  seeking: Gender[];

  @IsString()
  @Length(1, 80)
  city: string;
}
