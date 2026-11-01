import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard.js';
import { ErrorDto } from '../../auth/dto.js';
import { ChannelDto, ProgramDto, ReplayDetailDto, ReplayQueryDto } from './live.dto.js';
import { LiveService } from './live.service.js';

// TV channels and their replays. Playback goes through the usual
// GET /tv/playback/:itemId with the program id.
@ApiTags('tv')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('tv')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get('channels')
  @ApiOkResponse({ type: [ChannelDto] })
  channels(): Promise<ChannelDto[]> {
    return this.live.channels();
  }

  @Get('replay')
  @ApiOkResponse({ type: [ProgramDto] })
  replays(@Query() q: ReplayQueryDto): Promise<ProgramDto[]> {
    return this.live.replays(q.channel, q.date);
  }

  @Get('replay/:id')
  @ApiOkResponse({ type: ReplayDetailDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'PROGRAM_NOT_FOUND' })
  replay(@Param('id') id: string): Promise<ReplayDetailDto> {
    return this.live.replay(id);
  }
}
