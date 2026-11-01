-- Channels are only for the TV guide and replays: no live stream links.
ALTER TABLE "channels" DROP COLUMN "playback_url",
DROP COLUMN "geo_blocked";
