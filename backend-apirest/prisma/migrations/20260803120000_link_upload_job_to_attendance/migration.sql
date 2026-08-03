ALTER TABLE "attendance_upload_jobs"
    ADD COLUMN "attendance_session_id" TEXT,
    ADD COLUMN "attendance_version" INTEGER;

CREATE INDEX "attendance_upload_jobs_attendance_session_id_attendance_version_idx"
    ON "attendance_upload_jobs"("attendance_session_id", "attendance_version");
