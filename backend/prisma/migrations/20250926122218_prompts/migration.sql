-- CreateTable
CREATE TABLE "public"."Prompt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_userId_position_key" ON "public"."Prompt"("userId", "position");

-- CreateIndex
CREATE INDEX "Prompt_userId_position_idx" ON "public"."Prompt"("userId", "position");

-- AddForeignKey
ALTER TABLE "public"."Prompt"
ADD CONSTRAINT "Prompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AllowedUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
