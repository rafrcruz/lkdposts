/*
  Warnings:

  - You are about to alter the column `ownerKey` on the `Feed` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "public"."Article" ADD COLUMN     "articleHtml" TEXT;

-- AlterTable
ALTER TABLE "public"."Feed" ALTER COLUMN "ownerKey" SET DATA TYPE VARCHAR(255);
