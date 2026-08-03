ALTER TYPE "AttendanceUploadStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

CREATE TABLE "academic_group_access_grants" (
  "assignment_id" TEXT NOT NULL,
  "external_group_id" TEXT NOT NULL,
  "professor_external_id" TEXT NOT NULL,
  "professor_institutional_code" TEXT,
  "professor_email" TEXT,
  "school_cycle_year" INTEGER NOT NULL,
  "school_cycle_term" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_group_access_grants_pkey" PRIMARY KEY ("assignment_id"),
  CONSTRAINT "academic_group_access_grants_school_cycle_term_check" CHECK ("school_cycle_term" BETWEEN 1 AND 3)
);

CREATE INDEX "academic_group_access_grants_external_group_id_active_idx"
  ON "academic_group_access_grants"("external_group_id", "active");
CREATE INDEX "academic_group_access_grants_professor_external_id_active_idx"
  ON "academic_group_access_grants"("professor_external_id", "active");
CREATE INDEX "academic_group_access_grants_professor_institutional_code_active_idx"
  ON "academic_group_access_grants"("professor_institutional_code", "active");
CREATE INDEX "academic_group_access_grants_professor_email_active_idx"
  ON "academic_group_access_grants"("professor_email", "active");
