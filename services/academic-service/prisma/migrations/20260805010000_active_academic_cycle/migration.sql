CREATE TABLE "academic_cycle_configuration" (
  "key" TEXT NOT NULL,
  "cycle_external_id" INTEGER NOT NULL,
  "cycle_year" INTEGER NOT NULL,
  "cycle_term" INTEGER NOT NULL,
  "cycle_name" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_by_identity_id" TEXT,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_cycle_configuration_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "academic_cycle_configuration_term_check" CHECK ("cycle_term" BETWEEN 1 AND 3)
);

CREATE TABLE "academic_cycle_configuration_audit" (
  "id" TEXT NOT NULL,
  "configuration_key" TEXT NOT NULL,
  "previous_cycle_external_id" INTEGER NOT NULL,
  "next_cycle_external_id" INTEGER NOT NULL,
  "previous_cycle_name" TEXT NOT NULL,
  "next_cycle_name" TEXT NOT NULL,
  "actor_identity_id" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_cycle_configuration_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_cycle_configuration_audit_configuration_key_fkey"
    FOREIGN KEY ("configuration_key") REFERENCES "academic_cycle_configuration"("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "academic_cycle_configuration_audit_created_at_idx"
  ON "academic_cycle_configuration_audit"("created_at");

CREATE INDEX "academic_cycle_configuration_audit_actor_identity_id_created_at_idx"
  ON "academic_cycle_configuration_audit"("actor_identity_id", "created_at");

INSERT INTO "academic_cycle_configuration" (
  "key", "cycle_external_id", "cycle_year", "cycle_term", "cycle_name", "revision"
) VALUES ('active', 152, 2026, 3, '2026 - 3 OTOÑO', 1)
ON CONFLICT ("key") DO NOTHING;
