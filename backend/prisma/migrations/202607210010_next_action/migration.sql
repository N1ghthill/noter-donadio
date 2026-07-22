ALTER TABLE "negotiations"
  ADD COLUMN "next_action" TEXT,
  ADD COLUMN "next_action_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "next_action_due_date" DATE,
  ADD COLUMN "next_action_due_date_confirmed_at" TIMESTAMPTZ(6);

ALTER TABLE "analysis_decisions"
  ADD COLUMN "applied_next_action" TEXT,
  ADD COLUMN "applied_next_action_due_date" DATE;

CREATE INDEX "negotiations_workspace_id_next_action_due_date_idx"
  ON "negotiations"("workspace_id", "next_action_due_date");
