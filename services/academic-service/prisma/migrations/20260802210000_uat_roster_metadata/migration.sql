ALTER TABLE "academic_enrollments" ADD COLUMN "uat_student_id" INTEGER;
ALTER TABLE "academic_enrollments" ADD COLUMN "list_number" INTEGER;
CREATE UNIQUE INDEX "academic_enrollments_group_id_uat_student_id_key"
  ON "academic_enrollments"("group_id", "uat_student_id");
