CREATE TABLE "substitute_assignments" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "primary_professor_id" TEXT NOT NULL,
    "substitute_professor_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "substitute_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "substitute_assignments_group_id_substitute_professor_id_key"
    ON "substitute_assignments"("group_id", "substitute_professor_id");

CREATE INDEX "substitute_assignments_primary_professor_id_idx"
    ON "substitute_assignments"("primary_professor_id");

CREATE INDEX "substitute_assignments_substitute_professor_id_idx"
    ON "substitute_assignments"("substitute_professor_id");

ALTER TABLE "substitute_assignments"
    ADD CONSTRAINT "substitute_assignments_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_assignments"
    ADD CONSTRAINT "substitute_assignments_primary_professor_id_fkey"
    FOREIGN KEY ("primary_professor_id") REFERENCES "professors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_assignments"
    ADD CONSTRAINT "substitute_assignments_substitute_professor_id_fkey"
    FOREIGN KEY ("substitute_professor_id") REFERENCES "professors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
