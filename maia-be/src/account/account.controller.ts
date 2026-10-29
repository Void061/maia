import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { ErrorDto, PASSWORD_MIN } from '../auth/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileDto, toProfileDto } from '../profiles/profiles.controller.js';

class AccountDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['USER', 'ADMIN'] }) role: string;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: [ProfileDto] }) profiles: ProfileDto[];
}

class UpdateAccountDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  name: string;
}

class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(200) currentPassword: string;
  @ApiProperty({ minLength: PASSWORD_MIN }) @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) newPassword: string;
}

// The signed-in account: details, name change, password change.
@ApiTags('account')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: AccountDto })
  async me(@CurrentUser() user: AuthUser): Promise<AccountDto> {
    const a = await this.prisma.account.findUniqueOrThrow({
      where: { id: user.accountId },
      include: { profiles: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      createdAt: a.createdAt.toISOString(),
      profiles: a.profiles.map(toProfileDto),
    };
  }

  @Patch()
  @HttpCode(204)
  @ApiNoContentResponse()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAccountDto) {
    await this.prisma.account.update({ where: { id: user.accountId }, data: { name: dto.name } });
  }

  @Post('password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Password cambiata; le altre sessioni vengono chiuse.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'WRONG_PASSWORD' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.accountId } });
    if (!(await verifyPassword(dto.currentPassword, account.passwordHash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'La password attuale non è corretta.' });
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: account.id },
        data: { passwordHash: await hashPassword(dto.newPassword) },
      }),
      // Other devices are logged out; this one stays signed in.
      this.prisma.session.updateMany({
        where: { accountId: account.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
