CREATE TYPE "AuditAction" AS ENUM (
  'contact_created',
  'contact_updated',
  'negotiation_stage_changed',
  'analysis_accepted',
  'analysis_ignored'
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "contact_id" UUID,
  "negotiation_id" UUID,
  "action" "AuditAction" NOT NULL,
  "changed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "previous_version" INTEGER,
  "resulting_version" INTEGER,
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_versions_positive_check" CHECK (
    ("previous_version" IS NULL OR "previous_version" > 0)
    AND ("resulting_version" IS NULL OR "resulting_version" > 0)
  )
);

CREATE INDEX "audit_events_workspace_id_created_at_idx" ON "audit_events"("workspace_id", "created_at");
CREATE INDEX "audit_events_contact_id_created_at_idx" ON "audit_events"("contact_id", "created_at");
CREATE INDEX "audit_events_negotiation_id_created_at_idx" ON "audit_events"("negotiation_id", "created_at");

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_user_id_fkey"
FOREIGN KEY ("workspace_id", "user_id") REFERENCES "users"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_negotiation_id_fkey"
FOREIGN KEY ("negotiation_id") REFERENCES "negotiations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
