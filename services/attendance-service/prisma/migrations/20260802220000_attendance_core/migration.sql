CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "AttendanceUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "attendance_roster_groups" (
  "id" TEXT NOT NULL, "external_group_id" TEXT NOT NULL, "uat_group_id" INTEGER,
  "name" TEXT NOT NULL, "group_letter" TEXT NOT NULL DEFAULT '', "professor_external_id" TEXT NOT NULL,
  "schedule" JSONB NOT NULL, "roster_version" TEXT NOT NULL, "roster_observed_at" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_roster_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "attendance_roster_students" (
  "id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "matricula" TEXT NOT NULL, "name" TEXT NOT NULL,
  "uat_student_id" INTEGER, "list_number" INTEGER, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_roster_students_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "attendance_sessions" (
  "id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "date" DATE NOT NULL, "professor_external_id" TEXT NOT NULL,
  "professor_entry_at" TIMESTAMP(3), "professor_exit_at" TIMESTAMP(3),
  "upload_status" "AttendanceUploadStatus" NOT NULL DEFAULT 'PENDING', "upload_error" TEXT,
  "uploaded_at" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "attendance_entries" (
  "id" TEXT NOT NULL, "session_id" TEXT NOT NULL, "matricula" TEXT NOT NULL, "status" "AttendanceStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "student_device_bindings" (
  "id" TEXT NOT NULL, "matricula" TEXT NOT NULL, "attendance_uuid" TEXT NOT NULL, "device_binding_id" TEXT,
  "platform" TEXT, "device_info" TEXT, "binding_version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "student_device_bindings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "device_binding_audit_events" (
  "id" TEXT NOT NULL, "binding_id" TEXT, "matricula" TEXT NOT NULL, "action" TEXT NOT NULL,
  "actor_identity_id" TEXT NOT NULL, "actor_role" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "previous_value" JSONB, "new_value" JSONB, "correlation_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_binding_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "attendance_commands" (
  "idempotency_key" TEXT NOT NULL, "operation" TEXT NOT NULL, "request_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_commands_pkey" PRIMARY KEY ("idempotency_key")
);
CREATE TABLE "attendance_outbox_events" (
  "event_id" TEXT NOT NULL, "event_type" TEXT NOT NULL, "aggregate_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL, "causation_id" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0, "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3), "last_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_outbox_events_pkey" PRIMARY KEY ("event_id")
);
CREATE TABLE "processed_attendance_events" (
  "event_id" TEXT NOT NULL, "consumer" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_attendance_events_pkey" PRIMARY KEY ("event_id", "consumer")
);

CREATE UNIQUE INDEX "attendance_roster_groups_external_group_id_key" ON "attendance_roster_groups"("external_group_id");
CREATE INDEX "attendance_roster_groups_professor_external_id_active_idx" ON "attendance_roster_groups"("professor_external_id", "active");
CREATE INDEX "attendance_roster_students_matricula_active_idx" ON "attendance_roster_students"("matricula", "active");
CREATE UNIQUE INDEX "attendance_roster_students_group_id_matricula_key" ON "attendance_roster_students"("group_id", "matricula");
CREATE UNIQUE INDEX "attendance_roster_students_group_id_uat_student_id_key" ON "attendance_roster_students"("group_id", "uat_student_id");
CREATE INDEX "attendance_sessions_professor_external_id_date_idx" ON "attendance_sessions"("professor_external_id", "date");
CREATE INDEX "attendance_sessions_upload_status_updated_at_idx" ON "attendance_sessions"("upload_status", "updated_at");
CREATE UNIQUE INDEX "attendance_sessions_group_id_date_key" ON "attendance_sessions"("group_id", "date");
CREATE UNIQUE INDEX "attendance_entries_session_id_matricula_key" ON "attendance_entries"("session_id", "matricula");
CREATE UNIQUE INDEX "student_device_bindings_matricula_key" ON "student_device_bindings"("matricula");
CREATE UNIQUE INDEX "student_device_bindings_attendance_uuid_key" ON "student_device_bindings"("attendance_uuid");
CREATE UNIQUE INDEX "student_device_bindings_device_binding_id_key" ON "student_device_bindings"("device_binding_id");
CREATE INDEX "student_device_bindings_attendance_uuid_idx" ON "student_device_bindings"("attendance_uuid");
CREATE INDEX "device_binding_audit_events_matricula_occurred_at_idx" ON "device_binding_audit_events"("matricula", "occurred_at");
CREATE INDEX "device_binding_audit_events_actor_identity_id_occurred_at_idx" ON "device_binding_audit_events"("actor_identity_id", "occurred_at");
CREATE INDEX "attendance_commands_created_at_idx" ON "attendance_commands"("created_at");
CREATE INDEX "attendance_outbox_events_published_at_next_attempt_at_creat_idx" ON "attendance_outbox_events"("published_at", "next_attempt_at", "created_at");

ALTER TABLE "attendance_roster_students" ADD CONSTRAINT "attendance_roster_students_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "attendance_roster_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "attendance_roster_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_binding_audit_events" ADD CONSTRAINT "device_binding_audit_events_binding_id_fkey" FOREIGN KEY ("binding_id") REFERENCES "student_device_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
