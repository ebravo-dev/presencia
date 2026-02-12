-- CreateEnum
CREATE TYPE "PortalSyncStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "portal_sync_status" "PortalSyncStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "portal_sync_error" TEXT,
ADD COLUMN     "portal_synced_at" TIMESTAMP(3);
