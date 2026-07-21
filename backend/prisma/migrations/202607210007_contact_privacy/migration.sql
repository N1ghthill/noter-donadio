ALTER TYPE "AuditAction" ADD VALUE 'contact_deleted';

CREATE TABLE "media_deletion_tasks" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "media_deletion_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_deletion_tasks_storage_key_key"
ON "media_deletion_tasks"("storage_key");

CREATE INDEX "media_deletion_tasks_created_at_idx"
ON "media_deletion_tasks"("created_at");

ALTER TABLE "media_deletion_tasks" ADD CONSTRAINT "media_deletion_tasks_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
