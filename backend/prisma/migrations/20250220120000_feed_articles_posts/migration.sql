-- CreateTable
CREATE TABLE "public"."Feed" (
    "id" SERIAL NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Article" (
    "id" SERIAL NOT NULL,
    "feedId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentSnippet" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "guid" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "public"."Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Feed_ownerKey_url_key" ON "public"."Feed"("ownerKey", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Article_feedId_guid_key" ON "public"."Article"("feedId", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "Article_feedId_link_key" ON "public"."Article"("feedId", "link");

-- CreateIndex
CREATE UNIQUE INDEX "Article_feedId_dedupeKey_key" ON "public"."Article"("feedId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Post_articleId_key" ON "public"."Post"("articleId");
