ALTER TABLE "attendance_roster_groups" ADD COLUMN "professor_email" TEXT;
CREATE INDEX "attendance_roster_groups_professor_email_active_idx"
  ON "attendance_roster_groups"("professor_email", "active");

CREATE TABLE "classroom_beacons" (
  "id" TEXT NOT NULL,
  "uuid" TEXT NOT NULL,
  "classroom" TEXT NOT NULL,
  "classroom_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "classroom_beacons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classroom_beacons_uuid_key" ON "classroom_beacons"("uuid");
CREATE UNIQUE INDEX "classroom_beacons_classroom_key_key" ON "classroom_beacons"("classroom_key");

CREATE TABLE "classroom_beacon_audit_events" (
  "id" TEXT NOT NULL,
  "beacon_id" TEXT,
  "action" TEXT NOT NULL,
  "actor_identity_id" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "correlation_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "classroom_beacon_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "classroom_beacon_audit_events_beacon_id_occurred_at_idx"
  ON "classroom_beacon_audit_events"("beacon_id", "occurred_at");
CREATE INDEX "classroom_beacon_audit_events_actor_identity_id_occurred_at_idx"
  ON "classroom_beacon_audit_events"("actor_identity_id", "occurred_at");

ALTER TABLE "classroom_beacon_audit_events"
  ADD CONSTRAINT "classroom_beacon_audit_events_beacon_id_fkey"
  FOREIGN KEY ("beacon_id") REFERENCES "classroom_beacons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
