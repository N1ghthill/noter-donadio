-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(512) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_workspace_id_email_key" ON "users"("workspace_id", "email");
CREATE UNIQUE INDEX "users_workspace_id_id_key" ON "users"("workspace_id", "id");
CREATE INDEX "users_workspace_id_status_idx" ON "users"("workspace_id", "status");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_token_hash_expires_at_idx" ON "sessions"("token_hash", "expires_at");
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

ALTER TABLE "users"
ADD CONSTRAINT "users_email_normalized_check"
CHECK ("email" = lower(trim("email")));

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_expiration_check"
CHECK ("expires_at" > "created_at");

ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_user_id_fkey"
FOREIGN KEY ("workspace_id", "user_id") REFERENCES "users"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
