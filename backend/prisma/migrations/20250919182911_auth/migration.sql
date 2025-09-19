-- DropIndex
DROP INDEX "public"."UserSession_userId_idx";

-- AlterTable
ALTER TABLE "public"."AllowedUser" ALTER COLUMN "updatedAt" DROP DEFAULT;
