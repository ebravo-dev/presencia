ALTER TABLE "GroupAssignment" ADD COLUMN "classroom" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "educationLevel" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "period" TEXT;
ALTER TABLE "GroupAssignment" ADD COLUMN "schedule" JSONB;

CREATE TABLE "CoordinatorUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COORDINATOR',
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CoordinatorUser_email_key" ON "CoordinatorUser"("email");

CREATE TABLE "CoordinatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoordinatorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "CoordinatorUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoordinatorSession_userId_idx" ON "CoordinatorSession"("userId");
CREATE INDEX "CoordinatorSession_expiresAt_idx" ON "CoordinatorSession"("expiresAt");
