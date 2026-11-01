-- CreateTable
CREATE TABLE "catalog_worker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_worker_pkey" PRIMARY KEY ("id")
);
