-- CreateTable
CREATE TABLE "student_ble_attendances" (
    "id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "beacon_id" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "device_info" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_ble_attendances_pkey" PRIMARY KEY ("id")
);
