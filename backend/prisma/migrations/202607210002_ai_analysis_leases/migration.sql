ALTER TABLE "ai_analyses"
ADD COLUMN "analysis_attempt_id" UUID,
ADD COLUMN "processing_started_at" TIMESTAMPTZ(6);

CREATE INDEX "ai_analyses_state_processing_started_at_idx"
ON "ai_analyses"("state", "processing_started_at");

ALTER TABLE "ai_analyses"
ADD CONSTRAINT "ai_analyses_processing_lease_check"
CHECK (
  (
    "state" = 'processing'
    AND "analysis_attempt_id" IS NOT NULL
    AND "processing_started_at" IS NOT NULL
  )
  OR
  (
    "state" <> 'processing'
    AND "analysis_attempt_id" IS NULL
    AND "processing_started_at" IS NULL
  )
);
