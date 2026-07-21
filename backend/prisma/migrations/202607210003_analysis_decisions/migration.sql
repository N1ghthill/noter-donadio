CREATE TYPE "AnalysisDecisionKind" AS ENUM ('accepted', 'ignored');

CREATE UNIQUE INDEX "ai_analyses_workspace_id_id_key"
ON "ai_analyses"("workspace_id", "id");

CREATE TABLE "analysis_decisions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "analysis_id" UUID NOT NULL,
  "negotiation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "decision" "AnalysisDecisionKind" NOT NULL,
  "applied_stage" "NegotiationStage",
  "applied_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resulting_negotiation_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analysis_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analysis_decisions_acceptance_fields_check" CHECK (
    "decision" = 'accepted' OR ("applied_stage" IS NULL AND cardinality("applied_tags") = 0)
  )
);

CREATE UNIQUE INDEX "analysis_decisions_analysis_id_key" ON "analysis_decisions"("analysis_id");
CREATE UNIQUE INDEX "analysis_decisions_workspace_id_id_key" ON "analysis_decisions"("workspace_id", "id");
CREATE UNIQUE INDEX "analysis_decisions_workspace_id_analysis_id_key" ON "analysis_decisions"("workspace_id", "analysis_id");
CREATE INDEX "analysis_decisions_workspace_id_created_at_idx" ON "analysis_decisions"("workspace_id", "created_at");
CREATE INDEX "analysis_decisions_negotiation_id_created_at_idx" ON "analysis_decisions"("negotiation_id", "created_at");

ALTER TABLE "analysis_decisions" ADD CONSTRAINT "analysis_decisions_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_decisions" ADD CONSTRAINT "analysis_decisions_workspace_id_analysis_id_fkey"
FOREIGN KEY ("workspace_id", "analysis_id") REFERENCES "ai_analyses"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_decisions" ADD CONSTRAINT "analysis_decisions_workspace_id_negotiation_id_fkey"
FOREIGN KEY ("workspace_id", "negotiation_id") REFERENCES "negotiations"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_decisions" ADD CONSTRAINT "analysis_decisions_workspace_id_user_id_fkey"
FOREIGN KEY ("workspace_id", "user_id") REFERENCES "users"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
