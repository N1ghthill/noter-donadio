ALTER TABLE "media_assets"
ADD COLUMN "encrypted_provider_reference" BYTEA,
ADD COLUMN "provider_reference_iv" BYTEA,
ADD COLUMN "provider_reference_auth_tag" BYTEA,
ADD COLUMN "provider_reference_key_version" SMALLINT;

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_provider_reference_complete_check"
CHECK (
  (
    "encrypted_provider_reference" IS NULL
    AND "provider_reference_iv" IS NULL
    AND "provider_reference_auth_tag" IS NULL
    AND "provider_reference_key_version" IS NULL
  )
  OR
  (
    "encrypted_provider_reference" IS NOT NULL
    AND "provider_reference_iv" IS NOT NULL
    AND "provider_reference_auth_tag" IS NOT NULL
    AND "provider_reference_key_version" IS NOT NULL
  )
);
