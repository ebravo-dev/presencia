CREATE TABLE "attendance_configuration" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "teacher_attendance_tolerance_minutes" INTEGER NOT NULL DEFAULT 10,
  "updated_by_identity_id" TEXT,
  "updated_by_role" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_configuration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_configuration_teacher_tolerance_check"
    CHECK ("teacher_attendance_tolerance_minutes" BETWEEN 0 AND 120)
);

INSERT INTO "attendance_configuration" (
  "id",
  "teacher_attendance_tolerance_minutes"
) VALUES ('global', 10)
ON CONFLICT ("id") DO NOTHING;
