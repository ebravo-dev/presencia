-- AlterTable
ALTER TABLE "students" ADD COLUMN "beacon_uuid" TEXT;

-- AlterTable
ALTER TABLE "attendance_records"
ADD COLUMN "professor_entry_at" TIMESTAMP(3),
ADD COLUMN "professor_exit_at" TIMESTAMP(3),
ADD COLUMN "room_beacon_uuid" TEXT,
ADD COLUMN "room_beacon_rssi" INTEGER,
ADD COLUMN "room_beacon_distance" DOUBLE PRECISION,
ADD COLUMN "room_beacon_address" TEXT;

-- CreateTable
CREATE TABLE "student_beacon_detections" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "attendance_record_id" TEXT NOT NULL,
    "beacon_uuid" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "rssi" INTEGER,
    "distance" DOUBLE PRECISION,
    "tx_power" INTEGER,
    "bluetooth_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_beacon_detections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_beacon_uuid_idx" ON "students"("beacon_uuid");

-- CreateTable
CREATE TABLE "student_device_bindings" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "attendance_uuid" TEXT NOT NULL,
    "device_binding_id" TEXT,
    "platform" TEXT,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_device_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_device_bindings_matricula_key"
ON "student_device_bindings"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "student_device_bindings_attendance_uuid_key"
ON "student_device_bindings"("attendance_uuid");

-- CreateIndex
CREATE INDEX "student_device_bindings_attendance_uuid_idx"
ON "student_device_bindings"("attendance_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "student_beacon_detections_student_id_attendance_record_id_key"
ON "student_beacon_detections"("student_id", "attendance_record_id");

-- CreateIndex
CREATE INDEX "student_beacon_detections_beacon_uuid_idx"
ON "student_beacon_detections"("beacon_uuid");

-- AddForeignKey
ALTER TABLE "student_beacon_detections"
ADD CONSTRAINT "student_beacon_detections_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_beacon_detections"
ADD CONSTRAINT "student_beacon_detections_attendance_record_id_fkey"
FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
