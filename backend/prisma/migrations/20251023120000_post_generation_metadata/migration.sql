-- CreateEnum
CREATE TYPE "public"."PostGenerationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "public"."Post"
  ADD COLUMN "model_used" TEXT,
  ADD COLUMN "generated_at" TIMESTAMP(3),
  ADD COLUMN "status" "public"."PostGenerationStatus" NOT NULL DEFAULT 'PENDING'::"public"."PostGenerationStatus",
  ADD COLUMN "error_reason" VARCHAR(255),
  ADD COLUMN "tokens_input" INTEGER,
  ADD COLUMN "tokens_output" INTEGER,
  ADD COLUMN "prompt_base_hash" VARCHAR(128),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "content" DROP NOT NULL;

-- Backfill existing records
UPDATE "public"."Post"
SET
  "generated_at" = "createdAt",
  "status" = CASE
    WHEN COALESCE("content", '') = '' THEN 'PENDING'::"public"."PostGenerationStatus"
    ELSE 'SUCCESS'::"public"."PostGenerationStatus"
  END;

-- CreateIndex
CREATE INDEX "Post_prompt_base_hash_idx" ON "public"."Post"("prompt_base_hash");
