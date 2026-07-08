CREATE TYPE "AttendanceUploadBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "AttendanceUploadJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "attendance_upload_batches" (
    "id" TEXT NOT NULL,
    "owner_username" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "credential_cipher" TEXT,
    "status" "AttendanceUploadBatchStatus" NOT NULL DEFAULT 'PENDING',
    "total_records" INTEGER NOT NULL,
    "completed_records" INTEGER NOT NULL DEFAULT 0,
    "failed_records" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "attendance_upload_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_upload_jobs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "owner_username" TEXT NOT NULL,
    "client_record_id" TEXT NOT NULL,
    "id_grupo" INTEGER NOT NULL,
    "fecha_inicio" TEXT NOT NULL,
    "attendances" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "AttendanceUploadJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "attendance_upload_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_upload_batches_owner_username_idempotency_key_key"
    ON "attendance_upload_batches"("owner_username", "idempotency_key");
CREATE INDEX "attendance_upload_batches_owner_username_created_at_idx"
    ON "attendance_upload_batches"("owner_username", "created_at");
CREATE INDEX "attendance_upload_batches_status_created_at_idx"
    ON "attendance_upload_batches"("status", "created_at");
CREATE UNIQUE INDEX "attendance_upload_jobs_batch_id_client_record_id_key"
    ON "attendance_upload_jobs"("batch_id", "client_record_id");
CREATE INDEX "attendance_upload_jobs_owner_username_client_record_id_created_at_idx"
    ON "attendance_upload_jobs"("owner_username", "client_record_id", "created_at");
CREATE INDEX "attendance_upload_jobs_status_next_attempt_at_created_at_idx"
    ON "attendance_upload_jobs"("status", "next_attempt_at", "created_at");

-- Prevent concurrent UAT sessions for the same professor even with multiple API replicas.
CREATE UNIQUE INDEX "attendance_upload_jobs_one_processing_per_owner_idx"
    ON "attendance_upload_jobs"("owner_username")
    WHERE "status" = 'PROCESSING';

ALTER TABLE "attendance_upload_jobs"
    ADD CONSTRAINT "attendance_upload_jobs_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "attendance_upload_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
