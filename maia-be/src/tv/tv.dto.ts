import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

// What the MAIA TV screens read. Sources never appear here: MAIA picks them.

export class TitleCardDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['MOVIE', 'SERIES'] }) kind: 'MOVIE' | 'SERIES';
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) year: number | null;
  @ApiProperty({ type: [String] }) genres: string[];
  @ApiProperty() overview: string;
  @ApiPropertyOptional({ nullable: true, type: String }) posterUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) backdropUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Movies: length' }) minutes: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Series: seasons with something to watch' })
  seasons: number | null;
}

export class RowDto {
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Genre slug, for "Vedi tutto"' }) genre: string | null;
  @ApiProperty({ type: [TitleCardDto] }) items: TitleCardDto[];
}

export class HomeDto {
  @ApiProperty({ type: [TitleCardDto] }) featured: TitleCardDto[];
  @ApiProperty({ type: [RowDto] }) rows: RowDto[];
}

export class GenreDto {
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty() count: number;
}

export class TitlePageDto {
  @ApiProperty({ type: [TitleCardDto] }) items: TitleCardDto[];
  @ApiProperty() total: number;
}

export class EpisodeDto {
  @ApiProperty() id: string;
  @ApiProperty() season: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) number: number | null;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) airDate: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) minutes: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: "The episode's own picture; null = use the title's backdrop" })
  imageUrl: string | null;
}

export class SeasonDto {
  @ApiProperty() number: number;
  @ApiProperty({ type: [EpisodeDto] }) episodes: EpisodeDto[];
}

export class ExtraDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) minutes: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: "The clip's own picture; null = use the title's backdrop" })
  imageUrl: string | null;
}

export class ExtraGroupDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['HIGHLIGHTS', 'CLIPS', 'PREVIEWS', 'EXTRAS'] }) kind: 'HIGHLIGHTS' | 'CLIPS' | 'PREVIEWS' | 'EXTRAS';
  @ApiProperty() label: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) season: number | null;
  @ApiProperty({ type: [ExtraDto] }) items: ExtraDto[];
}

export class TitleDetailDto extends TitleCardDto {
  @ApiPropertyOptional({ nullable: true, type: String }) originalName: string | null;
  @ApiProperty({ type: [SeasonDto] }) seasonList: SeasonDto[];
  @ApiProperty({ type: [ExtraGroupDto] }) extras: ExtraGroupDto[];
  @ApiProperty({ type: [TitleCardDto] }) similar: TitleCardDto[];
}

export class PlaybackDto {
  @ApiProperty({ description: 'Movie, episode or extra id' }) itemId: string;
  @ApiProperty() provider: string;
  @ApiProperty({
    enum: ['native-hls', 'hls'],
    description: 'native-hls: give url to <video src>, the device resolves it; hls: direct playlist URL for hls.js, expires in minutes',
  })
  type: 'native-hls' | 'hls';
  @ApiProperty() url: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) durationSec: number | null;
}

export class TitlesQueryDto {
  @ApiPropertyOptional({ enum: ['MOVIE', 'SERIES'] })
  @IsOptional()
  @IsIn(['MOVIE', 'SERIES'])
  kind?: 'MOVIE' | 'SERIES';

  @ApiPropertyOptional({ description: 'Genre slug' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  genre?: string;

  @ApiPropertyOptional({ description: 'Search in the title' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  q?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 60, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export class GenresQueryDto {
  @ApiPropertyOptional({ enum: ['MOVIE', 'SERIES'] })
  @IsOptional()
  @IsIn(['MOVIE', 'SERIES'])
  kind?: 'MOVIE' | 'SERIES';
}

export class PlaybackQueryDto {
  @ApiPropertyOptional({ description: 'Providers to skip, comma separated (after a failure)' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  exclude?: string;
}

export class StreamQueryDto {
  @ApiProperty({ description: 'Provider whose source the device could not play natively' })
  @IsString()
  @Length(1, 40)
  provider: string;
}

export class PlaybackFailedDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  provider: string;
}
