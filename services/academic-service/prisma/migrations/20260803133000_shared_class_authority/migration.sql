CREATE TABLE "academic_shared_class_assignments" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "assigned_teacher_id" TEXT NOT NULL,
  "school_cycle_year" INTEGER NOT NULL,
  "school_cycle_term" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "legacy_source_id" TEXT,
  "source_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_shared_class_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_shared_class_assignments_school_cycle_term_check" CHECK ("school_cycle_term" BETWEEN 1 AND 3)
);

CREATE TABLE "academic_shared_class_audit_events" (
  "id" TEXT NOT NULL,
  "assignment_id" TEXT,
  "action" TEXT NOT NULL,
  "actor_identity_id" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "correlation_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_shared_class_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_shared_class_assignments_legacy_source_id_key"
  ON "academic_shared_class_assignments"("legacy_source_id");
CREATE UNIQUE INDEX "academic_shared_class_assignments_group_teacher_cycle_key"
  ON "academic_shared_class_assignments"("group_id", "assigned_teacher_id", "school_cycle_year", "school_cycle_term");
CREATE INDEX "academic_shared_class_assignments_assignee_cycle_active_idx"
  ON "academic_shared_class_assignments"("assigned_teacher_id", "school_cycle_year", "school_cycle_term", "active");
CREATE INDEX "academic_shared_class_assignments_group_id_idx"
  ON "academic_shared_class_assignments"("group_id");
CREATE INDEX "academic_shared_class_audit_events_assignment_created_at_idx"
  ON "academic_shared_class_audit_events"("assignment_id", "created_at");
CREATE INDEX "academic_shared_class_audit_events_actor_created_at_idx"
  ON "academic_shared_class_audit_events"("actor_identity_id", "created_at");

ALTER TABLE "academic_shared_class_assignments"
  ADD CONSTRAINT "academic_shared_class_assignments_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_shared_class_assignments"
  ADD CONSTRAINT "academic_shared_class_assignments_assigned_teacher_id_fkey"
  FOREIGN KEY ("assigned_teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_shared_class_audit_events"
  ADD CONSTRAINT "academic_shared_class_audit_events_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "academic_shared_class_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
