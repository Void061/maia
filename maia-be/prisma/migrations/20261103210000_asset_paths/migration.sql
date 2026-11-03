-- Pictures are stored as a path plus the service they come from; maia-be
-- builds the full link with the service's asset address (assets.ts).
ALTER TABLE "titles" RENAME COLUMN "poster_url" TO "poster_path";
ALTER TABLE "titles" RENAME COLUMN "backdrop_url" TO "backdrop_path";
ALTER TABLE "titles" ADD COLUMN "poster_source" TEXT, ADD COLUMN "backdrop_source" TEXT;
ALTER TABLE "episodes" RENAME COLUMN "image_url" TO "image_path";
ALTER TABLE "episodes" ADD COLUMN "image_source" TEXT;
ALTER TABLE "extras" RENAME COLUMN "image_url" TO "image_path";
ALTER TABLE "extras" ADD COLUMN "image_source" TEXT;
ALTER TABLE "provider_health" ADD COLUMN "assets_url" TEXT;

-- TMDB: the size in the link (w500, w1280) is chosen again when reading.
UPDATE "titles" SET "poster_source" = 'tmdb',
       "poster_path" = substring("poster_path" from '^https://image\.tmdb\.org/t/p/[^/]+(/.*)$')
 WHERE "poster_path" ~ '^https://image\.tmdb\.org/t/p/[^/]+/';
UPDATE "titles" SET "backdrop_source" = 'tmdb',
       "backdrop_path" = substring("backdrop_path" from '^https://image\.tmdb\.org/t/p/[^/]+(/.*)$')
 WHERE "backdrop_path" ~ '^https://image\.tmdb\.org/t/p/[^/]+/';

-- RaiPlay: everything after the address.
UPDATE "titles" SET "poster_source" = 'raiplay', "poster_path" = substr("poster_path", 23)
 WHERE starts_with("poster_path", 'https://www.raiplay.it/');
UPDATE "titles" SET "backdrop_source" = 'raiplay', "backdrop_path" = substr("backdrop_path", 23)
 WHERE starts_with("backdrop_path", 'https://www.raiplay.it/');
UPDATE "episodes" SET "image_source" = 'raiplay', "image_path" = substr("image_path", 23)
 WHERE starts_with("image_path", 'https://www.raiplay.it/');
UPDATE "extras" SET "image_source" = 'raiplay', "image_path" = substr("image_path", 23)
 WHERE starts_with("image_path", 'https://www.raiplay.it/');
