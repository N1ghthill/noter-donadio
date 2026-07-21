ALTER TABLE "media_assets"
ADD COLUMN "transcription_attempt_id" UUID,
ADD COLUMN "processing_started_at" TIMESTAMPTZ(6);

CREATE INDEX "media_assets_transcription_state_processing_started_at_idx"
ON "media_assets"("transcription_state", "processing_started_at");

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_transcription_lease_check"
CHECK (
  (
    "transcription_state" = 'processing'
    AND "transcription_attempt_id" IS NOT NULL
    AND "processing_started_at" IS NOT NULL
  )
  OR
  (
    "transcription_state" <> 'processing'
    AND "transcription_attempt_id" IS NULL
    AND "processing_started_at" IS NULL
  )
);
