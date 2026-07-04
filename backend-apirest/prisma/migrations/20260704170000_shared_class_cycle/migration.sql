DROP INDEX "SharedClassAssignment_sourceAssignmentId_assignedTeacherId_key";
DROP INDEX "SharedClassAssignment_assignedTeacherId_active_idx";

ALTER TABLE "SharedClassAssignment"
  ADD COLUMN "schoolCycleYear" INTEGER NOT NULL DEFAULT 2026,
  ADD COLUMN "schoolCycleTerm" INTEGER NOT NULL DEFAULT 1,
  DROP COLUMN "startsAt",
  DROP COLUMN "endsAt";

ALTER TABLE "SharedClassAssignment"
  ADD CONSTRAINT "SharedClassAssignment_schoolCycleTerm_check"
  CHECK ("schoolCycleTerm" BETWEEN 1 AND 3);

CREATE UNIQUE INDEX "SharedClassAssignment_sourceAssignmentId_assignedTeacherId_schoolCycleYear_schoolCycleTerm_key"
  ON "SharedClassAssignment"("sourceAssignmentId", "assignedTeacherId", "schoolCycleYear", "schoolCycleTerm");

CREATE INDEX "SharedClassAssignment_assignedTeacherId_schoolCycleYear_schoolCycleTerm_active_idx"
  ON "SharedClassAssignment"("assignedTeacherId", "schoolCycleYear", "schoolCycleTerm", "active");
