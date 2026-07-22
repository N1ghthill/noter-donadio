ALTER TYPE "AuditAction" ADD VALUE 'negotiation_follow_up_completed';

ALTER TABLE "negotiations"
  ADD COLUMN "close_reason" TEXT;

CREATE TABLE "negotiation_follow_up_history" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "negotiation_id" UUID NOT NULL,
  "completed_by_user_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "due_date" DATE,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "negotiation_follow_up_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "negotiation_follow_up_history_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "negotiation_follow_up_history_workspace_id_negotiation_id_fkey"
    FOREIGN KEY ("workspace_id", "negotiation_id") REFERENCES "negotiations"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "negotiation_follow_up_history_workspace_id_completed_by_user_id_fkey"
    FOREIGN KEY ("workspace_id", "completed_by_user_id") REFERENCES "users"("workspace_id", "id") ON DELETE RESTRICT
);

CREATE INDEX "negotiation_follow_up_history_workspace_id_completed_at_idx"
  ON "negotiation_follow_up_history"("workspace_id", "completed_at");
CREATE INDEX "negotiation_follow_up_history_negotiation_id_completed_at_idx"
  ON "negotiation_follow_up_history"("negotiation_id", "completed_at");
