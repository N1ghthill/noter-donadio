DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "whatsapp_accounts"
    WHERE "provider_business_account_id" IS NOT NULL
       OR "provider_phone_number_id" IS NOT NULL
       OR "provider" = 'meta_cloud_api'
  ) THEN
    RAISE EXCEPTION 'legacy Meta account mapping must be cleared before this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "audit_events" AS audit
    JOIN "contacts" AS contact ON contact."id" = audit."contact_id"
    WHERE audit."workspace_id" <> contact."workspace_id"
  ) OR EXISTS (
    SELECT 1
    FROM "audit_events" AS audit
    JOIN "negotiations" AS negotiation ON negotiation."id" = audit."negotiation_id"
    WHERE audit."workspace_id" <> negotiation."workspace_id"
  ) THEN
    RAISE EXCEPTION 'cross-workspace audit reference must be resolved before this migration';
  END IF;
END
$$;

ALTER TABLE "audit_events"
DROP CONSTRAINT "audit_events_contact_id_fkey",
DROP CONSTRAINT "audit_events_negotiation_id_fkey";

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_workspace_id_contact_id_fkey"
FOREIGN KEY ("workspace_id", "contact_id")
REFERENCES "contacts"("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE,
ADD CONSTRAINT "audit_events_workspace_id_negotiation_id_fkey"
FOREIGN KEY ("workspace_id", "negotiation_id")
REFERENCES "negotiations"("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "whatsapp_accounts"
DROP CONSTRAINT "whatsapp_accounts_meta_cloud_mapping_check";

DROP INDEX "whatsapp_accounts_provider_provider_phone_number_id_key";

ALTER TABLE "whatsapp_accounts"
DROP COLUMN "provider_business_account_id",
DROP COLUMN "provider_phone_number_id";
