-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('whatsapp_auto', 'manual', 'import');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('active', 'archived', 'blocked');

-- CreateEnum
CREATE TYPE "NegotiationStage" AS ENUM ('lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'audio', 'image', 'video', 'document', 'system_note');

-- CreateEnum
CREATE TYPE "ProcessingState" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('positive', 'neutral', 'negative', 'urgent');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "WhatsappConnectionStatus" AS ENUM ('disconnected', 'qr_generated', 'connecting', 'connected', 'timeout');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "identifier" VARCHAR(100) NOT NULL,
    "phone_number" VARCHAR(20),
    "connection_status" "WhatsappConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "last_connected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_auth_keys" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "key_id" VARCHAR(255) NOT NULL,
    "encrypted_data" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_auth_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "jid" VARCHAR(255),
    "phone_number" VARCHAR(20) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL DEFAULT 'Novo Contato',
    "profile_picture_url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'whatsapp_auto',
    "status" "ContactStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_interaction_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "stage" "NegotiationStage" NOT NULL DEFAULT 'lead',
    "value" DECIMAL(15,2),
    "value_confirmed_at" TIMESTAMPTZ(6),
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "expected_close_date" DATE,
    "product_interest" TEXT,
    "last_summary" TEXT,
    "sentiment" "Sentiment",
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "pipeline_stage_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "whatsapp_account_id" UUID NOT NULL,
    "external_message_id" VARCHAR(255) NOT NULL,
    "contact_id" UUID NOT NULL,
    "negotiation_id" UUID,
    "direction" "MessageDirection" NOT NULL,
    "message_type" "MessageType" NOT NULL,
    "content" TEXT,
    "content_hash" CHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "storage_key" VARCHAR(500),
    "file_size_bytes" BIGINT,
    "duration_seconds" INTEGER,
    "mime_type" VARCHAR(100),
    "transcription_state" "ProcessingState" NOT NULL DEFAULT 'pending',
    "transcription_text" TEXT,
    "transcription_confidence" DECIMAL(5,4),
    "transcription_language" VARCHAR(10),
    "transcription_model" VARCHAR(100),
    "failure_code" VARCHAR(100),
    "transcribed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "negotiation_id" UUID NOT NULL,
    "analysis_type" VARCHAR(50) NOT NULL DEFAULT 'message_extraction',
    "state" "ProcessingState" NOT NULL DEFAULT 'pending',
    "summary" TEXT,
    "entities" JSONB,
    "sentiment" "Sentiment",
    "sentiment_confidence" DECIMAL(5,4),
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "next_actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggested_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggested_stage" "NegotiationStage",
    "confidence_score" DECIMAL(5,4),
    "prompt_version" VARCHAR(100) NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "model_used" VARCHAR(100),
    "processing_time_ms" INTEGER,
    "failure_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_workspace_id_idx" ON "whatsapp_accounts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_workspace_id_identifier_key" ON "whatsapp_accounts"("workspace_id", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_workspace_id_id_key" ON "whatsapp_accounts"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_auth_keys_account_id_category_key_id_key" ON "whatsapp_auth_keys"("account_id", "category", "key_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_phone_number_idx" ON "contacts"("workspace_id", "phone_number");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_status_idx" ON "contacts"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "contacts_tags_idx" ON "contacts" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_jid_key" ON "contacts"("workspace_id", "jid");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_id_key" ON "contacts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "negotiations_workspace_id_stage_idx" ON "negotiations"("workspace_id", "stage");

-- CreateIndex
CREATE INDEX "negotiations_contact_id_idx" ON "negotiations"("contact_id");

-- CreateIndex
CREATE INDEX "negotiations_workspace_id_priority_idx" ON "negotiations"("workspace_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "negotiations_workspace_id_id_key" ON "negotiations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_occurred_at_idx" ON "messages"("workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "messages_contact_id_occurred_at_idx" ON "messages"("contact_id", "occurred_at");

-- CreateIndex
CREATE INDEX "messages_negotiation_id_occurred_at_idx" ON "messages"("negotiation_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_whatsapp_account_id_external_message_id_key" ON "messages"("whatsapp_account_id", "external_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_workspace_id_id_key" ON "messages"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_message_id_key" ON "media_assets"("message_id");

-- CreateIndex
CREATE INDEX "media_assets_workspace_id_transcription_state_idx" ON "media_assets"("workspace_id", "transcription_state");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_workspace_id_message_id_key" ON "media_assets"("workspace_id", "message_id");

-- CreateIndex
CREATE INDEX "ai_analyses_workspace_id_state_idx" ON "ai_analyses"("workspace_id", "state");

-- CreateIndex
CREATE INDEX "ai_analyses_negotiation_id_created_at_idx" ON "ai_analyses"("negotiation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analyses_message_id_analysis_type_prompt_version_key" ON "ai_analyses"("message_id", "analysis_type", "prompt_version");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_workspace_id_created_at_idx" ON "outbox_events"("workspace_id", "created_at");

-- Invariantes que o Prisma Schema Language ainda não representa diretamente.
CREATE UNIQUE INDEX "negotiations_one_active_per_contact_key"
ON "negotiations"("contact_id")
WHERE "stage" NOT IN ('closed_won', 'closed_lost');

ALTER TABLE "negotiations"
ADD CONSTRAINT "negotiations_priority_range_check"
CHECK ("priority" BETWEEN 0 AND 5);

ALTER TABLE "messages"
ADD CONSTRAINT "messages_text_content_check"
CHECK ("message_type" <> 'text' OR "content" IS NOT NULL);

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_transcription_confidence_range_check"
CHECK ("transcription_confidence" IS NULL OR "transcription_confidence" BETWEEN 0 AND 1);

ALTER TABLE "ai_analyses"
ADD CONSTRAINT "ai_analyses_confidence_ranges_check"
CHECK (
  ("sentiment_confidence" IS NULL OR "sentiment_confidence" BETWEEN 0 AND 1)
  AND ("confidence_score" IS NULL OR "confidence_score" BETWEEN 0 AND 1)
);

ALTER TABLE "outbox_events"
ADD CONSTRAINT "outbox_events_attempts_nonnegative_check"
CHECK ("attempts" >= 0);

ALTER TABLE "whatsapp_auth_keys"
ADD CONSTRAINT "whatsapp_auth_keys_aes_gcm_shape_check"
CHECK (octet_length("iv") = 12 AND octet_length("auth_tag") = 16);

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_auth_keys" ADD CONSTRAINT "whatsapp_auth_keys_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_whatsapp_account_id_fkey" FOREIGN KEY ("workspace_id", "whatsapp_account_id") REFERENCES "whatsapp_accounts"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_negotiation_id_fkey" FOREIGN KEY ("workspace_id", "negotiation_id") REFERENCES "negotiations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_workspace_id_negotiation_id_fkey" FOREIGN KEY ("workspace_id", "negotiation_id") REFERENCES "negotiations"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
