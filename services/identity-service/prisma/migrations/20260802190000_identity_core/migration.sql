CREATE TYPE "IdentityKind" AS ENUM ('PROFESSOR', 'STUDENT', 'STAFF');
CREATE TYPE "IdentityRole" AS ENUM ('PROFESSOR', 'STUDENT', 'COORDINATOR', 'READ_ONLY', 'SUPER_USER');

CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "kind" "IdentityKind" NOT NULL,
    "role" "IdentityRole" NOT NULL,
    "institutional_identifier" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "disabled_at" TIMESTAMP(3),
    "last_authenticated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_audit_events" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identities_kind_institutional_identifier_key"
ON "identities"("kind", "institutional_identifier");
CREATE INDEX "identities_email_idx" ON "identities"("email");
CREATE INDEX "identities_role_disabled_at_idx" ON "identities"("role", "disabled_at");
CREATE INDEX "security_audit_events_identity_id_occurred_at_idx"
ON "security_audit_events"("identity_id", "occurred_at");
CREATE INDEX "security_audit_events_action_occurred_at_idx"
ON "security_audit_events"("action", "occurred_at");

ALTER TABLE "security_audit_events"
ADD CONSTRAINT "security_audit_events_identity_id_fkey"
FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
