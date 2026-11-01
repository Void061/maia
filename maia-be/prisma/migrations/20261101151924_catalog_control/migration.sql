-- CreateTable
CREATE TABLE "catalog_control" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "changed_at" TIMESTAMP(3),
    "changed_by" TEXT,

    CONSTRAINT "catalog_control_pkey" PRIMARY KEY ("id")
);
