-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "provider_health" ADD COLUMN     "last_check_at" TIMESTAMP(3),
ADD COLUMN     "sync_at" TEXT NOT NULL DEFAULT '03:00',
ADD COLUMN     "sync_every_hours" INTEGER DEFAULT 3,
ADD COLUMN     "sync_mode" "SyncMode" NOT NULL DEFAULT 'AUTO';
