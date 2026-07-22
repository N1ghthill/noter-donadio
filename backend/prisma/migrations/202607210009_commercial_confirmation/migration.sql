ALTER TYPE "AuditAction" ADD VALUE 'negotiation_updated';

ALTER TABLE "negotiations"
  ADD COLUMN "expected_close_date_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "product_interest_confirmed_at" TIMESTAMPTZ(6);

ALTER TABLE "analysis_decisions"
  ADD COLUMN "applied_value" DECIMAL(15, 2),
  ADD COLUMN "applied_expected_close_date" DATE,
  ADD COLUMN "applied_product_interest" TEXT;
