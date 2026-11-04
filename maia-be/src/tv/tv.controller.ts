import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiExcludeEndpoint, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { GenreDto, GenresQueryDto, HomeDto, TitleDetailDto, TitlePageDto, TitlesQueryDto } from './tv.dto.js';
import { StreamProxyService } from './stream-proxy.js';
import { TmdbCatalogService } from './tmdb-catalog.service.js';

// MAIA TV catalog and playback for the signed-in screens.
@ApiTags('tv')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('tv')
export class TvController {
  constructor(
    private readonly catalog: TmdbCatalogService,
    private readonly streamProxy: StreamProxyService,
  ) {}

  @Get('home')
  @ApiOkResponse({ type: HomeDto })
  home(): Promise<HomeDto> {
    return this.catalog.home();
  }

  @Get('genres')
  @ApiOkResponse({ type: [GenreDto] })
  genres(@Query() q: GenresQueryDto): Promise<GenreDto[]> {
    return this.catalog.genres(q.kind);
  }

  @Get('titles')
  @ApiOkResponse({ type: TitlePageDto })
  titles(@Query() q: TitlesQueryDto): Promise<TitlePageDto> {
    return this.catalog.titles(q);
  }

  @Get('titles/:id')
  @ApiOkResponse({ type: TitleDetailDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'TITLE_NOT_FOUND' })
  title(@Param('id') id: string): Promise<TitleDetailDto> {
    return this.catalog.title(id);
  }

  // The whole video through maia-be (see stream-proxy.ts). One request
  // per segment, so outside the rate limit.
  @Get('proxy/:itemId')
  @SkipThrottle()
  @ApiExcludeEndpoint()
  proxy(
    @Param('itemId') itemId: string,
    @Query('u') u: string | undefined,
    @Query('s') s: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.streamProxy.serve(itemId, u, s, req, res);
  }
}
