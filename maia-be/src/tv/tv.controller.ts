import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import {
  GenreDto,
  GenresQueryDto,
  HomeDto,
  PlaybackDto,
  PlaybackFailedDto,
  PlaybackQueryDto,
  TitleDetailDto,
  TitlePageDto,
  TitlesQueryDto,
} from './tv.dto.js';
import { TvService } from './tv.service.js';

// MAIA TV catalog and playback for the signed-in screens.
@ApiTags('tv')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('tv')
export class TvController {
  constructor(private readonly tv: TvService) {}

  @Get('home')
  @ApiOkResponse({ type: HomeDto })
  home(): Promise<HomeDto> {
    return this.tv.home();
  }

  @Get('genres')
  @ApiOkResponse({ type: [GenreDto] })
  genres(@Query() q: GenresQueryDto): Promise<GenreDto[]> {
    return this.tv.genres(q.kind);
  }

  @Get('titles')
  @ApiOkResponse({ type: TitlePageDto })
  titles(@Query() q: TitlesQueryDto): Promise<TitlePageDto> {
    return this.tv.titles(q);
  }

  @Get('titles/:id')
  @ApiOkResponse({ type: TitleDetailDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'TITLE_NOT_FOUND' })
  title(@Param('id') id: string): Promise<TitleDetailDto> {
    return this.tv.title(id);
  }

  // What to give the player. The stream URL is resolved by the device (the
  // services check the viewer's country), never by the server.
  @Get('playback/:itemId')
  @ApiOkResponse({ type: PlaybackDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'NO_SOURCE' })
  playback(@Param('itemId') itemId: string, @Query() q: PlaybackQueryDto): Promise<PlaybackDto> {
    return this.tv.playback(itemId, q.exclude?.split(',').filter(Boolean) ?? []);
  }

  @Post('playback/:itemId/failed')
  @HttpCode(204)
  @ApiNoContentResponse()
  async playbackFailed(@Param('itemId') itemId: string, @Body() dto: PlaybackFailedDto) {
    await this.tv.playbackFailed(itemId, dto.provider);
  }
}
