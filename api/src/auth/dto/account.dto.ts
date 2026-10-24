import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class TokenDto {
  @IsString()
  @MaxLength(2000)
  token: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @Length(8, 128)
  password: string;
}
