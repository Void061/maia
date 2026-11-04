import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const PASSWORD_MIN = 8;

export class RegisterDto {
  @ApiProperty({ example: 'Ivan' })
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiProperty({ example: 'ivan@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(200)
  password: string;
}

export class LoginResultDto {
  @ApiProperty({ description: 'true: no session yet, a code was sent by email' }) twoFactor: boolean;
  @ApiPropertyOptional({ description: 'For /auth/login/verify and /auth/login/resend' }) challenge?: string;
}

export class VerifyCodeDto {
  @ApiProperty() @IsString() @MaxLength(100) challenge: string;
  @ApiProperty({ example: '123456' }) @Transform(trim) @IsString() @Length(6, 6) code: string;
}

export class ChallengeDto {
  @ApiProperty() @IsString() @MaxLength(100) challenge: string;
}

export class PairingStartDto {
  @ApiProperty({ description: 'Secret of this TV, to ask for the answer' }) token: string;
  @ApiProperty({ description: 'What the phone confirms: in the QR and on screen' }) code: string;
  @ApiProperty() expiresAt: string;
}

export class PairingPollDto {
  @ApiProperty() @IsString() @MaxLength(100) token: string;
}

export class PairingStatusDto {
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'expired'] }) status: string;
}

export class PairingCodeDto {
  @ApiProperty() @IsString() @MaxLength(20) code: string;
}

export class PairingInfoDto {
  @ApiProperty({ description: 'The device asking to sign in' }) device: string;
}

export class LoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password: string;
}

export class EmailDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(10, 200)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(200)
  password: string;
}

/// Reasons why a login or an email link is refused, read by maia-fe to pick
/// the right screen.
export const AuthError = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  SUSPENDED: 'SUSPENDED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
} as const;

export class ErrorDto {
  @ApiProperty({ enum: Object.values(AuthError) })
  code: string;

  @ApiProperty()
  message: string;
}
