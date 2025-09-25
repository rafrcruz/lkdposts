-- AlterTable
ALTER TABLE "public"."Prompt"
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill existing records
UPDATE "public"."Prompt" SET "enabled" = TRUE WHERE "enabled" IS NULL;
