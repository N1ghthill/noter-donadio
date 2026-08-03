DROP INDEX IF EXISTS "negotiations_one_active_per_contact_key";

ALTER TABLE "ai_analyses"
ADD COLUMN "conversation_context" JSONB;
