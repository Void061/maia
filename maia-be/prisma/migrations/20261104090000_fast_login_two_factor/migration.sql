-- Two-step verification by email (off by default) and login on a TV from a phone.
CREATE TYPE "EmailCodePurpose" AS ENUM ('LOGIN', 'ENABLE_2FA');
CREATE TYPE "PairingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DONE');

ALTER TABLE "accounts" ADD COLUMN "two_factor" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "email_codes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "purpose" "EmailCodePurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_codes_token_hash_key" ON "email_codes"("token_hash");
CREATE INDEX "email_codes_account_id_purpose_idx" ON "email_codes"("account_id", "purpose");
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "device_pairings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "status" "PairingStatus" NOT NULL DEFAULT 'PENDING',
    "account_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pairings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "device_pairings_code_key" ON "device_pairings"("code");
CREATE UNIQUE INDEX "device_pairings_token_hash_key" ON "device_pairings"("token_hash");
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
