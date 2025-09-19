-- CreateTable
CREATE TABLE "public"."HelloMessage" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelloMessage_pkey" PRIMARY KEY ("id")
);
