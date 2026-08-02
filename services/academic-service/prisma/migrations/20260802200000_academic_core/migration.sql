CREATE TABLE "teacher_profiles" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "institutional_code" TEXT,
  "name" TEXT NOT NULL, "email" TEXT, "last_authenticated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_cycles" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_cycles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_coordinations" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "name" TEXT NOT NULL, "short_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_coordinations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_subjects" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "code" TEXT, "name" TEXT NOT NULL,
  "coordination_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "academic_subjects_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_groups" (
  "id" TEXT NOT NULL, "external_group_id" TEXT NOT NULL, "code" TEXT NOT NULL, "group_letter" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL, "level" TEXT, "classroom" TEXT, "schedule" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "teacher_id" TEXT NOT NULL, "cycle_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL, "coordination_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_enrollments" (
  "id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "matricula" TEXT NOT NULL, "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "academic_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "processed_academic_snapshots" (
  "snapshot_id" TEXT NOT NULL, "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_academic_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);
CREATE TABLE "student_academic_profiles" (
  "id" TEXT NOT NULL, "matricula" TEXT NOT NULL, "display_name" TEXT NOT NULL, "email" TEXT,
  "plan_external_id" TEXT NOT NULL, "career_name" TEXT NOT NULL, "coordination_external_id" TEXT,
  "cycle_external_id" TEXT NOT NULL, "cycle_name" TEXT NOT NULL, "last_synchronized_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_academic_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "student_schedule_entries" (
  "id" TEXT NOT NULL, "student_id" TEXT NOT NULL, "plan_external_id" TEXT NOT NULL,
  "cycle_external_id" TEXT NOT NULL, "external_group_id" TEXT NOT NULL, "group_letter" TEXT NOT NULL DEFAULT '',
  "subject_name" TEXT NOT NULL, "professor_name" TEXT, "classroom" TEXT, "period" TEXT, "credits" INTEGER,
  "schedule" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_schedule_entries_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "academic_outbox_events" (
  "event_id" TEXT NOT NULL, "event_type" TEXT NOT NULL, "aggregate_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL, "causation_id" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0, "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3), "last_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_outbox_events_pkey" PRIMARY KEY ("event_id")
);
CREATE UNIQUE INDEX "teacher_profiles_external_id_key" ON "teacher_profiles"("external_id");
CREATE INDEX "teacher_profiles_email_idx" ON "teacher_profiles"("email");
CREATE UNIQUE INDEX "academic_cycles_external_id_key" ON "academic_cycles"("external_id");
CREATE UNIQUE INDEX "academic_coordinations_external_id_key" ON "academic_coordinations"("external_id");
CREATE UNIQUE INDEX "academic_subjects_external_id_key" ON "academic_subjects"("external_id");
CREATE INDEX "academic_subjects_coordination_id_idx" ON "academic_subjects"("coordination_id");
CREATE UNIQUE INDEX "academic_groups_external_group_id_key" ON "academic_groups"("external_group_id");
CREATE INDEX "academic_groups_teacher_id_cycle_id_active_idx" ON "academic_groups"("teacher_id", "cycle_id", "active");
CREATE INDEX "academic_groups_coordination_id_active_idx" ON "academic_groups"("coordination_id", "active");
CREATE UNIQUE INDEX "academic_enrollments_group_id_matricula_key" ON "academic_enrollments"("group_id", "matricula");
CREATE INDEX "academic_enrollments_matricula_active_idx" ON "academic_enrollments"("matricula", "active");
CREATE UNIQUE INDEX "student_academic_profiles_matricula_key" ON "student_academic_profiles"("matricula");
CREATE INDEX "student_academic_profiles_coordination_external_id_cycle_external_id_idx" ON "student_academic_profiles"("coordination_external_id", "cycle_external_id");
CREATE UNIQUE INDEX "student_schedule_entries_student_id_plan_external_id_cycle_external_id_external_group_id_key" ON "student_schedule_entries"("student_id", "plan_external_id", "cycle_external_id", "external_group_id");
CREATE INDEX "student_schedule_entries_student_id_active_idx" ON "student_schedule_entries"("student_id", "active");
CREATE INDEX "student_schedule_entries_external_group_id_active_idx" ON "student_schedule_entries"("external_group_id", "active");
CREATE INDEX "academic_outbox_events_published_at_next_attempt_at_created_at_idx" ON "academic_outbox_events"("published_at", "next_attempt_at", "created_at");
ALTER TABLE "academic_subjects" ADD CONSTRAINT "academic_subjects_coordination_id_fkey" FOREIGN KEY ("coordination_id") REFERENCES "academic_coordinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "academic_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_coordination_id_fkey" FOREIGN KEY ("coordination_id") REFERENCES "academic_coordinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_enrollments" ADD CONSTRAINT "academic_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_schedule_entries" ADD CONSTRAINT "student_schedule_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_academic_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
