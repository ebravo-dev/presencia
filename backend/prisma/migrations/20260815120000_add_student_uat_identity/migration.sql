ALTER TABLE "students"
ADD COLUMN "uat_student_id" INTEGER,
ADD COLUMN "list_number" INTEGER;

CREATE UNIQUE INDEX "students_uat_student_id_group_id_key"
ON "students"("uat_student_id", "group_id");
