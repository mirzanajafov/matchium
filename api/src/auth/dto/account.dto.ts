import { IsEmail, IsString, Length } from 'class-validator';

export class TokenDto {
  @IsString()
  @Length(10, 2000)
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
