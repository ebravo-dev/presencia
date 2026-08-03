ALTER TABLE "attendance_roster_groups"
  ADD COLUMN "professor_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "classroom" TEXT,
  ADD COLUMN "period" TEXT;
