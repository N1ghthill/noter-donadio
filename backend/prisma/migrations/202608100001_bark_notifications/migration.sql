CREATE TYPE "NotificationChannel" AS ENUM ('bark');

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "state" "ProcessingState" NOT NULL DEFAULT 'pending',
    "attempt_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failure_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_deliveries_message_id_channel_key"
ON "notification_deliveries"("message_id", "channel");

CREATE INDEX "notification_deliveries_workspace_id_state_idx"
ON "notification_deliveries"("workspace_id", "state");

ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_workspace_id_message_id_fkey"
FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
