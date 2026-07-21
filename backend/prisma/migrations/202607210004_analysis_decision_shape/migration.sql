ALTER TABLE "analysis_decisions"
DROP CONSTRAINT "analysis_decisions_acceptance_fields_check";

ALTER TABLE "analysis_decisions"
ADD CONSTRAINT "analysis_decisions_acceptance_fields_check"
CHECK (
  (
    "decision" = 'accepted'
    AND ("applied_stage" IS NOT NULL OR cardinality("applied_tags") > 0)
  )
  OR
  (
    "decision" = 'ignored'
    AND "applied_stage" IS NULL
    AND cardinality("applied_tags") = 0
  )
);
