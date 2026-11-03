-- SDM pictures were saved as a full link (the adapter wrote the host):
-- only the path is kept, on SDM's pictures address (assets.ts).
UPDATE "titles" SET "poster_source" = 'sdm', "poster_path" = substring("poster_path" from '^https?://[^/]+(/.*)$')
 WHERE "poster_source" IS NULL AND "poster_path" ~ '^https?://[^/]+/';
UPDATE "titles" SET "backdrop_source" = 'sdm', "backdrop_path" = substring("backdrop_path" from '^https?://[^/]+(/.*)$')
 WHERE "backdrop_source" IS NULL AND "backdrop_path" ~ '^https?://[^/]+/';
UPDATE "episodes" SET "image_source" = 'sdm', "image_path" = substring("image_path" from '^https?://[^/]+(/.*)$')
 WHERE "image_source" IS NULL AND "image_path" ~ '^https?://[^/]+/';
UPDATE "extras" SET "image_source" = 'sdm', "image_path" = substring("image_path" from '^https?://[^/]+(/.*)$')
 WHERE "image_source" IS NULL AND "image_path" ~ '^https?://[^/]+/';
