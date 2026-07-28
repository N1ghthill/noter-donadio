ALTER TABLE "whatsapp_accounts"
ADD COLUMN "provider" VARCHAR(50),
ADD COLUMN "provider_business_account_id" VARCHAR(255),
ADD COLUMN "provider_phone_number_id" VARCHAR(255);

CREATE UNIQUE INDEX "whatsapp_accounts_provider_provider_phone_number_id_key"
ON "whatsapp_accounts"("provider", "provider_phone_number_id");

ALTER TABLE "whatsapp_accounts"
ADD CONSTRAINT "whatsapp_accounts_meta_cloud_mapping_check"
CHECK (
  "provider" IS NULL
  OR "provider" <> 'meta_cloud_api'
  OR (
    "provider_business_account_id" IS NOT NULL
    AND "provider_phone_number_id" IS NOT NULL
  )
);
