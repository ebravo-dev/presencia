-- CreateTable
CREATE TABLE IF NOT EXISTS "student_device_bindings" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "student_device_bindings_matricula_key"
ON "student_device_bindings"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "student_device_bindings_attendance_uuid_key"
ON "student_device_bindings"("attendance_uuid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_device_bindings_attendance_uuid_idx"
ON "student_device_bindings"("attendance_uuid");

-- Ensure repeated students across groups can share the same registered phone UUID.
DROP INDEX IF EXISTS "students_beacon_uuid_key";

CREATE INDEX IF NOT EXISTS "students_beacon_uuid_idx"
ON "students"("beacon_uuid");
