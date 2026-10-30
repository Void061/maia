import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { AccountStatus, Prisma, Role, type Account } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard } from './admin.guard.js';

class AdminAccountDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty() createdAt: string;
  @ApiPropertyOptional({ nullable: true, type: String }) emailVerifiedAt: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) approvedAt: string | null;
  @ApiProperty() profileCount: number;
}

// Accounts per status, for the filter badges.
class StatusCountsDto {
  @ApiProperty() PENDING_EMAIL: number;
  @ApiProperty() PENDING_APPROVAL: number;
  @ApiProperty() ACTIVE: number;
  @ApiProperty() SUSPENDED: number;
}

class AdminAccountsDto {
  @ApiProperty({ type: [AdminAccountDto] }) accounts: AdminAccountDto[];
  @ApiProperty({ type: StatusCountsDto }) counts: StatusCountsDto;
}

class ListQuery {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Searches name and email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

class RoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

const toDto = (a: Account & { _count: { profiles: number } }): AdminAccountDto => ({
  id: a.id,
  email: a.email,
  name: a.name,
  status: a.status,
  role: a.role,
  createdAt: a.createdAt.toISOString(),
  emailVerifiedAt: a.emailVerifiedAt?.toISOString() ?? null,
  approvedAt: a.approvedAt?.toISOString() ?? null,
  profileCount: a._count.profiles,
});

// Admin panel API: list accounts, approve, reject, suspend, reactivate, roles.
// An admin can never act on their own account here, so MAIA can't be left
// without an administrator by mistake.
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ type: ErrorDto, description: 'NOT_ADMIN' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/accounts')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdminAccountsDto })
  async list(@Query() query: ListQuery): Promise<AdminAccountsDto> {
    const search: Prisma.AccountWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [accounts, grouped] = await Promise.all([
      this.prisma.account.findMany({
        where: { ...search, ...(query.status ? { status: query.status } : {}) },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { profiles: true } } },
        take: 500,
      }),
      this.prisma.account.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(Object.values(AccountStatus).map((s) => [s, 0])) as Record<AccountStatus, number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    return { accounts: accounts.map(toDto), counts };
  }

  @Post(':id/approve')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Account attivo; all'utente parte l'email di conferma." })
  async approve(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const account = await this.target(me, id);
    if (account.status === AccountStatus.ACTIVE) return;
    if (account.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException({ code: 'USE_REACTIVATE', message: 'Per un account sospeso usa Riattiva.' });
    }
    await this.prisma.account.update({
      where: { id },
      data: {
        status: AccountStatus.ACTIVE,
        approvedAt: new Date(),
        // Approving vouches for the address even if the link was never opened.
        emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
      },
    });
    await this.mail.send({
      to: account.email,
      subject: 'Il tuo account MAIA è attivo',
      lines: [`Ciao ${account.name},`, 'un amministratore ha abilitato il tuo account: ora puoi accedere a MAIA.'],
      action: { label: 'Accedi', url: `${this.mail.appUrl}/login` },
    });
  }

  @Post(':id/suspend')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Account sospeso; tutte le sue sessioni chiuse.' })
  async suspend(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.target(me, id);
    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id }, data: { status: AccountStatus.SUSPENDED } }),
      this.prisma.session.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorDto, description: 'NOT_SUSPENDED' })
  async reactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const account = await this.target(me, id);
    if (account.status !== AccountStatus.SUSPENDED) {
      throw new BadRequestException({ code: 'NOT_SUSPENDED', message: "L'account non è sospeso." });
    }
    await this.prisma.account.update({
      where: { id },
      data: { status: AccountStatus.ACTIVE, approvedAt: account.approvedAt ?? new Date() },
    });
  }

  @Post(':id/role')
  @HttpCode(204)
  @ApiNoContentResponse()
  async setRole(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: RoleDto) {
    await this.target(me, id);
    await this.prisma.account.update({ where: { id }, data: { role: dto.role } });
  }

  // "Rifiuta": removes the account and everything attached (profiles, sessions, links).
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.target(me, id);
    await this.prisma.account.delete({ where: { id } });
  }

  private async target(me: AuthUser, id: string) {
    if (id === me.accountId) {
      throw new BadRequestException({ code: 'SELF', message: 'Non puoi modificare il tuo account da qui.' });
    }
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Account non trovato.' });
    return account;
  }
}
