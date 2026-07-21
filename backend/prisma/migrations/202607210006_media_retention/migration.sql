ALTER TABLE "media_assets"
ADD COLUMN "retention_until" TIMESTAMPTZ(6),
ADD COLUMN "removed_at" TIMESTAMPTZ(6);

CREATE INDEX "media_assets_retention_until_removed_at_idx"
ON "media_assets"("retention_until", "removed_at");

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_removal_shape_check"
CHECK ("removed_at" IS NULL OR "storage_key" IS NULL);
