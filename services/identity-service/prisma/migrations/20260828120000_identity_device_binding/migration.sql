ALTER TABLE "identities"
ADD COLUMN "device_binding_id" TEXT,
ADD COLUMN "device_platform" TEXT,
ADD COLUMN "device_info" TEXT;

CREATE INDEX "identities_kind_device_binding_id_idx" ON "identities"("kind", "device_binding_id");
