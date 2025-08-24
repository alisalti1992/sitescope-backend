-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrawlJob" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL,
    "ai" BOOLEAN NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "totalUniquePagesFound" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "pagesRemaining" INTEGER NOT NULL DEFAULT 0,
    "canContinue" BOOLEAN NOT NULL DEFAULT true,
    "lastCrawledUrl" TEXT,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrawledPage" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "htmlContent" TEXT,
    "textContent" TEXT,
    "screenshotPath" TEXT,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "wordCount" INTEGER,
    "linkCount" INTEGER,
    "imageCount" INTEGER,
    "h1Tags" TEXT[],
    "h2Tags" TEXT[],
    "h3Tags" TEXT[],
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT,
    "twitterTitle" TEXT,
    "twitterDescription" TEXT,
    "twitterImage" TEXT,
    "lang" TEXT,
    "charset" TEXT,
    "viewport" TEXT,
    "robots" TEXT,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawledPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscoveredLink" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "isCrawlable" BOOLEAN NOT NULL DEFAULT true,
    "isCrawled" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveredLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "CrawledPage_jobId_idx" ON "public"."CrawledPage"("jobId");

-- CreateIndex
CREATE INDEX "CrawledPage_url_idx" ON "public"."CrawledPage"("url");

-- CreateIndex
CREATE INDEX "DiscoveredLink_jobId_idx" ON "public"."DiscoveredLink"("jobId");

-- CreateIndex
CREATE INDEX "DiscoveredLink_jobId_isCrawlable_idx" ON "public"."DiscoveredLink"("jobId", "isCrawlable");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredLink_jobId_url_key" ON "public"."DiscoveredLink"("jobId", "url");

-- AddForeignKey
ALTER TABLE "public"."CrawledPage" ADD CONSTRAINT "CrawledPage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscoveredLink" ADD CONSTRAINT "DiscoveredLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
