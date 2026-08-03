CREATE TABLE "staff_credentials" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "legacy_source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staff_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_credentials_identity_id_key" ON "staff_credentials"("identity_id");
CREATE UNIQUE INDEX "staff_credentials_email_key" ON "staff_credentials"("email");
CREATE UNIQUE INDEX "staff_credentials_legacy_source_id_key" ON "staff_credentials"("legacy_source_id");

ALTER TABLE "staff_credentials"
ADD CONSTRAINT "staff_credentials_identity_id_fkey"
FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
