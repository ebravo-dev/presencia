CREATE TABLE "SharedClassAssignment" (
    "id" TEXT NOT NULL,
    "sourceAssignmentId" TEXT NOT NULL,
    "assignedTeacherId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedClassAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedClassAssignment_sourceAssignmentId_assignedTeacherId_key"
    ON "SharedClassAssignment"("sourceAssignmentId", "assignedTeacherId");

CREATE INDEX "SharedClassAssignment_assignedTeacherId_active_idx"
    ON "SharedClassAssignment"("assignedTeacherId", "active");

CREATE INDEX "SharedClassAssignment_sourceAssignmentId_idx"
    ON "SharedClassAssignment"("sourceAssignmentId");

ALTER TABLE "SharedClassAssignment"
    ADD CONSTRAINT "SharedClassAssignment_sourceAssignmentId_fkey"
    FOREIGN KEY ("sourceAssignmentId") REFERENCES "GroupAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedClassAssignment"
    ADD CONSTRAINT "SharedClassAssignment_assignedTeacherId_fkey"
    FOREIGN KEY ("assignedTeacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
