import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ConfirmSignupDto extends TokenDto {
  @IsString()
  @Length(8, 128)
  password: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @Length(8, 128)
  password: string;
}
