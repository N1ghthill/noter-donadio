ALTER TABLE "whatsapp_auth_keys"
ADD COLUMN "workspace_id" UUID,
ADD COLUMN "encryption_key_version" SMALLINT NOT NULL DEFAULT 1;

UPDATE "whatsapp_auth_keys" AS auth_key
SET "workspace_id" = account."workspace_id"
FROM "whatsapp_accounts" AS account
WHERE account."id" = auth_key."account_id";

ALTER TABLE "whatsapp_auth_keys"
ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "whatsapp_auth_keys"
DROP CONSTRAINT "whatsapp_auth_keys_account_id_fkey";

ALTER TABLE "whatsapp_auth_keys"
ADD CONSTRAINT "whatsapp_auth_keys_workspace_id_fkey"
FOREIGN KEY ("workspace_id")
REFERENCES "workspaces"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "whatsapp_auth_keys"
ADD CONSTRAINT "whatsapp_auth_keys_workspace_id_account_id_fkey"
FOREIGN KEY ("workspace_id", "account_id")
REFERENCES "whatsapp_accounts"("workspace_id", "id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "whatsapp_auth_keys_workspace_id_account_id_idx"
ON "whatsapp_auth_keys"("workspace_id", "account_id");
