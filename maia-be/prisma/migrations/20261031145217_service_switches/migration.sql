-- AlterTable
ALTER TABLE "provider_health" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "switched_at" TIMESTAMP(3),
ADD COLUMN     "switched_by" TEXT;
