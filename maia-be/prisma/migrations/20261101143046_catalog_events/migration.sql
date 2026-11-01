-- CreateTable
CREATE TABLE "catalog_events" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "external_id" TEXT,
    "name" TEXT,
    "found" INTEGER,
    "queued" INTEGER,
    "message" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_events_provider_id_idx" ON "catalog_events"("provider", "id");

-- CreateIndex
CREATE INDEX "catalog_events_at_idx" ON "catalog_events"("at");
