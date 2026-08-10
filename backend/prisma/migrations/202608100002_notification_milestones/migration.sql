CREATE TYPE "NotificationKind" AS ENUM (
    'message_received',
    'analysis_completed',
    'analysis_attention',
    'transcription_attention'
);

ALTER TABLE "notification_deliveries"
ADD COLUMN "kind" "NotificationKind" NOT NULL DEFAULT 'message_received';

DROP INDEX "notification_deliveries_message_id_channel_key";

CREATE UNIQUE INDEX "notification_deliveries_message_id_channel_kind_key"
ON "notification_deliveries"("message_id", "channel", "kind");
