-- CreateTable
CREATE TABLE "beacons" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "classroom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beacons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beacons_uuid_key" ON "beacons"("uuid");
