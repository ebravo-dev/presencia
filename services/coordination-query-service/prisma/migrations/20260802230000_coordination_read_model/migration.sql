CREATE TABLE "coordination_projections" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "name" TEXT NOT NULL, "short_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coordination_projections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "teacher_projections" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "institutional_code" TEXT, "name" TEXT NOT NULL, "email" TEXT,
  "last_authenticated_at" TIMESTAMP(3) NOT NULL, "last_harvested_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teacher_projections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "subject_projections" (
  "id" TEXT NOT NULL, "external_id" TEXT NOT NULL, "code" TEXT, "name" TEXT NOT NULL, "coordination_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subject_projections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "group_projections" (
  "id" TEXT NOT NULL, "external_group_id" TEXT NOT NULL, "code" TEXT NOT NULL, "group_letter" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL, "level" TEXT, "classroom" TEXT, "period" TEXT, "schedule" JSONB NOT NULL,
  "cycle_external_id" TEXT NOT NULL, "cycle_name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "teacher_id" TEXT NOT NULL, "subject_id" TEXT NOT NULL, "coordination_id" TEXT NOT NULL,
  "source_observed_at" TIMESTAMP(3) NOT NULL, "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "group_projections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "attendance_projections" (
  "attendance_session_id" TEXT NOT NULL, "external_group_id" TEXT NOT NULL, "professor_external_id" TEXT NOT NULL,
  "date" DATE NOT NULL, "professor_entry_at" TIMESTAMP(3), "professor_exit_at" TIMESTAMP(3),
  "upload_status" TEXT NOT NULL DEFAULT 'PENDING', "upload_error" TEXT, "version" INTEGER NOT NULL,
  "entries_count" INTEGER NOT NULL DEFAULT 0, "source_observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_projections_pkey" PRIMARY KEY ("attendance_session_id")
);
CREATE TABLE "attendance_upload_result_projections" (
  "attendance_session_id" TEXT NOT NULL, "version" INTEGER NOT NULL, "status" TEXT NOT NULL, "error" TEXT,
  "source_observed_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_upload_result_projections_pkey" PRIMARY KEY ("attendance_session_id", "version")
);
CREATE TABLE "processed_query_events" (
  "event_id" TEXT NOT NULL, "consumer" TEXT NOT NULL, "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_query_events_pkey" PRIMARY KEY ("event_id", "consumer")
);

CREATE UNIQUE INDEX "coordination_projections_external_id_key" ON "coordination_projections"("external_id");
CREATE UNIQUE INDEX "teacher_projections_external_id_key" ON "teacher_projections"("external_id");
CREATE INDEX "teacher_projections_name_idx" ON "teacher_projections"("name");
CREATE INDEX "teacher_projections_email_idx" ON "teacher_projections"("email");
CREATE UNIQUE INDEX "subject_projections_external_id_key" ON "subject_projections"("external_id");
CREATE INDEX "subject_projections_coordination_id_idx" ON "subject_projections"("coordination_id");
CREATE UNIQUE INDEX "group_projections_external_group_id_key" ON "group_projections"("external_group_id");
CREATE INDEX "group_projections_teacher_id_active_idx" ON "group_projections"("teacher_id", "active");
CREATE INDEX "group_projections_coordination_id_active_idx" ON "group_projections"("coordination_id", "active");
CREATE INDEX "group_projections_cycle_external_id_active_idx" ON "group_projections"("cycle_external_id", "active");
CREATE INDEX "attendance_projections_professor_external_id_date_idx" ON "attendance_projections"("professor_external_id", "date");
CREATE INDEX "attendance_projections_external_group_id_date_idx" ON "attendance_projections"("external_group_id", "date");
CREATE INDEX "processed_query_events_processed_at_idx" ON "processed_query_events"("processed_at");

ALTER TABLE "subject_projections" ADD CONSTRAINT "subject_projections_coordination_id_fkey"
  FOREIGN KEY ("coordination_id") REFERENCES "coordination_projections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_projections" ADD CONSTRAINT "group_projections_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "teacher_projections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_projections" ADD CONSTRAINT "group_projections_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subject_projections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_projections" ADD CONSTRAINT "group_projections_coordination_id_fkey"
  FOREIGN KEY ("coordination_id") REFERENCES "coordination_projections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
