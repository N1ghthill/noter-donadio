ALTER TABLE "media_assets"
ADD COLUMN "external_media_id" VARCHAR(255),
ADD COLUMN "download_state" "ProcessingState" NOT NULL DEFAULT 'completed',
ADD COLUMN "download_attempt_id" UUID,
ADD COLUMN "download_started_at" TIMESTAMPTZ(6),
ADD COLUMN "download_failure_code" VARCHAR(100);

CREATE INDEX "media_assets_workspace_id_download_state_idx"
ON "media_assets"("workspace_id", "download_state");
