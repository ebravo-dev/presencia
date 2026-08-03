ALTER TABLE "attendance_sessions"
  ADD COLUMN "finalized_at" TIMESTAMP(3),
  ADD COLUMN "room_beacon_uuid" TEXT,
  ADD COLUMN "room_beacon_rssi" INTEGER,
  ADD COLUMN "room_beacon_distance" DOUBLE PRECISION,
  ADD COLUMN "room_beacon_address" TEXT;

CREATE TABLE "student_presence_detections" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "matricula" TEXT NOT NULL,
  "beacon_uuid" TEXT NOT NULL,
  "first_detected_at" TIMESTAMP(3) NOT NULL,
  "last_detected_at" TIMESTAMP(3) NOT NULL,
  "client_detected_at" TIMESTAMP(3),
  "rssi" INTEGER,
  "distance" DOUBLE PRECISION,
  "tx_power" INTEGER,
  "bluetooth_address" TEXT,
  "major" INTEGER,
  "minor" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_presence_detections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_presence_detections_session_id_matricula_key"
  ON "student_presence_detections"("session_id", "matricula");
CREATE INDEX "student_presence_detections_beacon_uuid_last_detected_at_idx"
  ON "student_presence_detections"("beacon_uuid", "last_detected_at");

ALTER TABLE "student_presence_detections"
  ADD CONSTRAINT "student_presence_detections_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
