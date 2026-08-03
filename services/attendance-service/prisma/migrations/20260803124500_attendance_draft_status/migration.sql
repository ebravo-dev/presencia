CREATE TYPE "AttendanceUploadStatus_new" AS ENUM ('DRAFT', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "attendance_sessions"
  ALTER COLUMN "upload_status" DROP DEFAULT,
  ALTER COLUMN "upload_status" TYPE "AttendanceUploadStatus_new"
    USING ("upload_status"::text::"AttendanceUploadStatus_new"),
  ALTER COLUMN "upload_status" SET DEFAULT 'DRAFT';

DROP TYPE "AttendanceUploadStatus";
ALTER TYPE "AttendanceUploadStatus_new" RENAME TO "AttendanceUploadStatus";
