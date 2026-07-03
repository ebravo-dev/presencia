-- Esquema acumulativo local. Las claves externalId soportan UPSERT idempotente.
CREATE TABLE "Coordination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Coordination_externalId_key" ON "Coordination"("externalId");
CREATE INDEX "Coordination_name_idx" ON "Coordination"("name");

CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "institutionalCode" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "lastAuthenticatedAt" DATETIME NOT NULL,
    "lastHarvestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Teacher_externalId_key" ON "Teacher"("externalId");
CREATE INDEX "Teacher_name_idx" ON "Teacher"("name");
CREATE INDEX "Teacher_institutionalCode_idx" ON "Teacher"("institutionalCode");

CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "coordinationId" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "Subject_coordinationId_fkey" FOREIGN KEY ("coordinationId") REFERENCES "Coordination" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Subject_externalId_key" ON "Subject"("externalId");
CREATE INDEX "Subject_coordinationId_name_idx" ON "Subject"("coordinationId", "name");

CREATE TABLE "GroupAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalGroupId" TEXT NOT NULL,
    "groupCode" TEXT,
    "schoolCycleExternalId" TEXT NOT NULL,
    "schoolCycleName" TEXT,
    "rawPayload" JSONB,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "coordinationId" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "GroupAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupAssignment_coordinationId_fkey" FOREIGN KEY ("coordinationId") REFERENCES "Coordination" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GroupAssignment_externalGroupId_key" ON "GroupAssignment"("externalGroupId");
CREATE INDEX "GroupAssignment_teacherId_idx" ON "GroupAssignment"("teacherId");
CREATE INDEX "GroupAssignment_subjectId_idx" ON "GroupAssignment"("subjectId");
CREATE INDEX "GroupAssignment_coordinationId_schoolCycleExternalId_idx" ON "GroupAssignment"("coordinationId", "schoolCycleExternalId");
