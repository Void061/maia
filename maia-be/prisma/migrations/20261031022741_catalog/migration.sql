-- CreateEnum
CREATE TYPE "TitleKind" AS ENUM ('MOVIE', 'SERIES');

-- CreateEnum
CREATE TYPE "MatchVerdict" AS ENUM ('AUTO', 'REVIEW', 'NEW', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExtraKind" AS ENUM ('HIGHLIGHTS', 'CLIPS', 'PREVIEWS', 'EXTRAS');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('OK', 'DEGRADED', 'DOWN');

-- CreateTable
CREATE TABLE "titles" (
    "id" TEXT NOT NULL,
    "kind" "TitleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "original_name" TEXT,
    "year" INTEGER,
    "tmdb_id" INTEGER,
    "overview" TEXT NOT NULL DEFAULT '',
    "poster_url" TEXT,
    "backdrop_url" TEXT,
    "genres" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "number" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "air_date" DATE,
    "provisional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "provider_title_id" TEXT NOT NULL,
    "title_id" TEXT,
    "episode_id" TEXT,
    "playback_url" TEXT NOT NULL,
    "drm" BOOLEAN NOT NULL DEFAULT false,
    "geo_blocked" BOOLEAN NOT NULL DEFAULT false,
    "duration_sec" INTEGER,
    "expires_at" TIMESTAMP(3),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_titles" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "kind" "TitleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "title_id" TEXT,
    "verdict" "MatchVerdict",
    "match_score" DOUBLE PRECISION,
    "content_hash" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "miss_count" INTEGER NOT NULL DEFAULT 0,
    "check_interval_days" INTEGER NOT NULL DEFAULT 1,
    "next_check_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_change_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_reviews" (
    "id" TEXT NOT NULL,
    "provider_title_id" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "match_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_groups" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "kind" "ExtraKind" NOT NULL,
    "label" TEXT NOT NULL,
    "season_number" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "extra_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extras" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playback_url" TEXT NOT NULL,
    "drm" BOOLEAN NOT NULL DEFAULT false,
    "duration_sec" INTEGER,
    "expires_at" TIMESTAMP(3),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_health" (
    "provider" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'OK',
    "fail_streak" INTEGER NOT NULL DEFAULT 0,
    "retry_after" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_health_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "found" INTEGER,
    "enqueued" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "note" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "titles_kind_tmdb_id_key" ON "titles"("kind", "tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_title_id_number_key" ON "seasons"("title_id", "number");

-- CreateIndex
CREATE INDEX "episodes_season_id_air_date_idx" ON "episodes"("season_id", "air_date");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_season_id_number_key" ON "episodes"("season_id", "number");

-- CreateIndex
CREATE INDEX "sources_title_id_idx" ON "sources"("title_id");

-- CreateIndex
CREATE INDEX "sources_episode_id_idx" ON "sources"("episode_id");

-- CreateIndex
CREATE INDEX "sources_provider_title_id_idx" ON "sources"("provider_title_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_provider_external_id_key" ON "sources"("provider", "external_id");

-- CreateIndex
CREATE INDEX "provider_titles_next_check_at_idx" ON "provider_titles"("next_check_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_titles_provider_external_id_key" ON "provider_titles"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_reviews_provider_title_id_key" ON "match_reviews"("provider_title_id");

-- CreateIndex
CREATE INDEX "match_reviews_status_idx" ON "match_reviews"("status");

-- CreateIndex
CREATE INDEX "extra_groups_title_id_idx" ON "extra_groups"("title_id");

-- CreateIndex
CREATE UNIQUE INDEX "extra_groups_provider_external_id_key" ON "extra_groups"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "extras_group_id_external_id_key" ON "extras"("group_id", "external_id");

-- CreateIndex
CREATE INDEX "sync_runs_provider_started_at_idx" ON "sync_runs"("provider", "started_at");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_provider_title_id_fkey" FOREIGN KEY ("provider_title_id") REFERENCES "provider_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_titles" ADD CONSTRAINT "provider_titles_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_provider_title_id_fkey" FOREIGN KEY ("provider_title_id") REFERENCES "provider_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_groups" ADD CONSTRAINT "extra_groups_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extras" ADD CONSTRAINT "extras_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "extra_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
