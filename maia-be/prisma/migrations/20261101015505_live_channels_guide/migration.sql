-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "logo_url" TEXT,
    "playback_url" TEXT,
    "geo_blocked" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_programs" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "episode_title" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "image_url" TEXT,
    "replay_path" TEXT,
    "playback_url" TEXT,
    "duration_sec" INTEGER,
    "playable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "live_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_provider_external_id_key" ON "channels"("provider", "external_id");

-- CreateIndex
CREATE INDEX "live_programs_channel_id_starts_at_idx" ON "live_programs"("channel_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "live_programs_channel_id_external_id_key" ON "live_programs"("channel_id", "external_id");

-- AddForeignKey
ALTER TABLE "live_programs" ADD CONSTRAINT "live_programs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
