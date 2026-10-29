import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import type { Profile } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAX_PROFILES = 5;

export class ProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ minimum: 0, maximum: 359 }) hue: number;
  @ApiPropertyOptional({ nullable: true, type: String }) lastAppKey: string | null;
}

export const toProfileDto = (p: Profile): ProfileDto => ({
  id: p.id,
  name: p.name,
  hue: p.hue,
  lastAppKey: p.lastAppKey,
});

class CreateProfileDto {
  @ApiProperty({ example: 'Ivan' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 20)
  name: string;

  @ApiProperty({ minimum: 0, maximum: 359 })
  @IsInt()
  @Min(0)
  @Max(359)
  hue: number;
}

class UpdateProfileDto extends PartialType(CreateProfileDto) {
  @ApiPropertyOptional({ example: 'tv' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  lastAppKey?: string;
}

// Profiles of the signed-in account: at most 5, names unique within the account.
@ApiTags('profiles')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: [ProfileDto] })
  async list(@CurrentUser() user: AuthUser): Promise<ProfileDto[]> {
    const profiles = await this.prisma.profile.findMany({
      where: { accountId: user.accountId },
      orderBy: { createdAt: 'asc' },
    });
    return profiles.map(toProfileDto);
  }

  @Post()
  @ApiCreatedResponse({ type: ProfileDto })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'PROFILE_LIMIT' })
  @ApiConflictResponse({ type: ErrorDto, description: 'PROFILE_NAME_TAKEN' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateProfileDto): Promise<ProfileDto> {
    const existing = await this.prisma.profile.findMany({ where: { accountId: user.accountId } });
    if (existing.length >= MAX_PROFILES) {
      throw new BadRequestException({ code: 'PROFILE_LIMIT', message: `Un account può avere al massimo ${MAX_PROFILES} profili.` });
    }
    this.assertNameFree(existing, dto.name);
    const profile = await this.prisma.profile.create({ data: { accountId: user.accountId, name: dto.name, hue: dto.hue } });
    return toProfileDto(profile);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProfileDto })
  @ApiConflictResponse({ type: ErrorDto, description: 'PROFILE_NAME_TAKEN' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProfileDto): Promise<ProfileDto> {
    await this.own(user, id);
    if (dto.name !== undefined) {
      const others = await this.prisma.profile.findMany({ where: { accountId: user.accountId, id: { not: id } } });
      this.assertNameFree(others, dto.name);
    }
    const profile = await this.prisma.profile.update({ where: { id }, data: dto });
    return toProfileDto(profile);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.own(user, id);
    await this.prisma.profile.delete({ where: { id } });
  }

  private async own(user: AuthUser, id: string) {
    const profile = await this.prisma.profile.findFirst({ where: { id, accountId: user.accountId } });
    if (!profile) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Profilo non trovato.' });
    return profile;
  }

  private assertNameFree(profiles: Profile[], name: string) {
    if (profiles.some((p) => p.name.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'))) {
      throw new ConflictException({ code: 'PROFILE_NAME_TAKEN', message: 'Esiste già un profilo con questo nome.' });
    }
  }
}
