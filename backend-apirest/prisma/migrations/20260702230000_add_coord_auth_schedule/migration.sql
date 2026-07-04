ALTER TABLE "GroupAssignment" ADD COLUMN "classroom" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "educationLevel" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "period" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "schedule" JSONB;

CREATE TABLE "CoordinatorUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COORDINATOR',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinatorUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoordinatorUser_email_key" ON "CoordinatorUser"("email");

CREATE TABLE "CoordinatorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoordinatorSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoordinatorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "CoordinatorUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoordinatorSession_userId_idx" ON "CoordinatorSession"("userId");
CREATE INDEX "CoordinatorSession_expiresAt_idx" ON "CoordinatorSession"("expiresAt");
