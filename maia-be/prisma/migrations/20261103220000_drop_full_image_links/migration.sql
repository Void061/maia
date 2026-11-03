-- Pictures saved as a full link to an outside site (SDM, before paths) are
-- dropped: every picture now is a path on a service's pictures address.
UPDATE "titles" SET "poster_path" = NULL WHERE "poster_source" IS NULL AND "poster_path" ~ '^https?://';
UPDATE "titles" SET "backdrop_path" = NULL WHERE "backdrop_source" IS NULL AND "backdrop_path" ~ '^https?://';
UPDATE "episodes" SET "image_path" = NULL WHERE "image_source" IS NULL AND "image_path" ~ '^https?://';
UPDATE "extras" SET "image_path" = NULL WHERE "image_source" IS NULL AND "image_path" ~ '^https?://';
