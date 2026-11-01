import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

// TV channels and the replays of their last 7 days (docs/tv/catalog.md, "Replay").

export class ProgramDto {
  @ApiProperty() id: string;
  @ApiProperty() channelId: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true, type: String }) episodeTitle: string | null;
  @ApiProperty() description: string;
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty({ format: 'date-time' }) end: string;
  @ApiPropertyOptional({ nullable: true, type: String }) imageUrl: string | null;
  @ApiProperty({ description: 'Can be watched again (replay), once it has aired' }) replay: boolean;
}

export const CHANNEL_CATEGORIES = ['general', 'movies-series', 'culture', 'kids', 'news-sport'] as const;
export type ChannelCategory = (typeof CHANNEL_CATEGORIES)[number];

export class ChannelDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Channel number, as in the TV guide' }) number: number;
  @ApiProperty({ enum: CHANNEL_CATEGORIES }) category: ChannelCategory;
  @ApiPropertyOptional({ nullable: true, type: String }) logoUrl: string | null;
}

export class ReplayDetailDto extends ProgramDto {
  @ApiProperty() channelName: string;
}

export class ReplayQueryDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  channel: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (Rome); today when missing' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
