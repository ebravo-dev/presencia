-- Add group_letter column to identify groups like K, M, etc.
-- This is needed because the same code can have multiple groups (e.g., Web I group K and Web I group M)

-- Add the column with default value
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "group_letter" TEXT NOT NULL DEFAULT '';

-- Drop old unique constraint
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_code_professor_id_period_key";

-- Add new unique constraint including group_letter
ALTER TABLE "groups" ADD CONSTRAINT "groups_code_group_letter_professor_id_period_key" 
    UNIQUE ("code", "group_letter", "professor_id", "period");
