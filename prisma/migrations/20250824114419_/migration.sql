/*
  Warnings:

  - You are about to drop the `CrawledPage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscoveredLink` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CrawledPage" DROP CONSTRAINT "CrawledPage_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DiscoveredLink" DROP CONSTRAINT "DiscoveredLink_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."CrawlJob" ADD COLUMN     "takeScreenshots" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "public"."CrawledPage";

-- DropTable
DROP TABLE "public"."DiscoveredLink";

-- CreateTable
CREATE TABLE "public"."InternalLink" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "contentType" TEXT,
    "statusCode" INTEGER,
    "status" TEXT,
    "indexability" TEXT,
    "indexabilityStatus" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "h1" TEXT,
    "metaRobots" TEXT,
    "canonicalLinkElement" TEXT,
    "relNext" TEXT,
    "relPrev" TEXT,
    "httpRelNext" TEXT,
    "httpRelPrev" TEXT,
    "amphtmlLinkElement" TEXT,
    "sizeBytes" INTEGER,
    "transferredBytes" INTEGER,
    "totalTransferredBytes" INTEGER,
    "co2Mg" DOUBLE PRECISION,
    "carbonRating" TEXT,
    "responseTime" INTEGER,
    "wordCount" INTEGER,
    "sentenceCount" INTEGER,
    "avgWordsPerSentence" DOUBLE PRECISION,
    "fleschReadingEaseScore" DOUBLE PRECISION,
    "readability" TEXT,
    "textRatio" DOUBLE PRECISION,
    "crawlDepth" INTEGER,
    "folderDepth" INTEGER,
    "linkScore" DOUBLE PRECISION,
    "inlinks" INTEGER,
    "uniqueInlinks" INTEGER,
    "uniqueJsInlinks" INTEGER,
    "percentOfTotal" DOUBLE PRECISION,
    "outlinks" INTEGER,
    "uniqueOutlinks" INTEGER,
    "uniqueJsOutlinks" INTEGER,
    "externalOutlinks" INTEGER,
    "uniqueExternalOutlinks" INTEGER,
    "uniqueExternalJsOutlinks" INTEGER,
    "closestNearDuplicateMatch" TEXT,
    "numberOfNearDuplicates" INTEGER,
    "spellingErrors" INTEGER,
    "grammarErrors" INTEGER,
    "lastModified" TIMESTAMP(3),
    "redirectUrl" TEXT,
    "redirectType" TEXT,
    "cookies" TEXT,
    "language" TEXT,
    "httpVersion" TEXT,
    "mobileAlternateLink" TEXT,
    "closestSemanticallySimAddress" TEXT,
    "semanticSimilarityScore" DOUBLE PRECISION,
    "numberOfSemanticallySimilar" INTEGER,
    "semanticRelevanceScore" DOUBLE PRECISION,
    "urlEncodedAddress" TEXT,
    "htmlContent" TEXT,
    "screenshotUrl" TEXT,
    "crawlTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalLink" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "contentType" TEXT,
    "status" TEXT,
    "inlinks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Inlink" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "anchorText" TEXT,
    "altText" TEXT,
    "follow" BOOLEAN NOT NULL DEFAULT true,
    "target" TEXT,
    "rel" TEXT,
    "statusCode" INTEGER,
    "status" TEXT,
    "pathType" TEXT,
    "linkPath" TEXT,
    "linkPosition" INTEGER,
    "linkOrigin" TEXT,
    "size" INTEGER,
    "transferred" INTEGER,
    "fromInternalLinkId" INTEGER,
    "toInternalLinkId" INTEGER,
    "toExternalLinkId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inlink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalLink_jobId_idx" ON "public"."InternalLink"("jobId");

-- CreateIndex
CREATE INDEX "InternalLink_address_idx" ON "public"."InternalLink"("address");

-- CreateIndex
CREATE INDEX "InternalLink_statusCode_idx" ON "public"."InternalLink"("statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLink_jobId_address_key" ON "public"."InternalLink"("jobId", "address");

-- CreateIndex
CREATE INDEX "ExternalLink_jobId_idx" ON "public"."ExternalLink"("jobId");

-- CreateIndex
CREATE INDEX "ExternalLink_address_idx" ON "public"."ExternalLink"("address");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalLink_jobId_address_key" ON "public"."ExternalLink"("jobId", "address");

-- CreateIndex
CREATE INDEX "Inlink_jobId_idx" ON "public"."Inlink"("jobId");

-- CreateIndex
CREATE INDEX "Inlink_fromAddress_idx" ON "public"."Inlink"("fromAddress");

-- CreateIndex
CREATE INDEX "Inlink_toAddress_idx" ON "public"."Inlink"("toAddress");

-- CreateIndex
CREATE INDEX "Inlink_type_idx" ON "public"."Inlink"("type");

-- AddForeignKey
ALTER TABLE "public"."InternalLink" ADD CONSTRAINT "InternalLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalLink" ADD CONSTRAINT "ExternalLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inlink" ADD CONSTRAINT "Inlink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inlink" ADD CONSTRAINT "Inlink_fromInternalLinkId_fkey" FOREIGN KEY ("fromInternalLinkId") REFERENCES "public"."InternalLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inlink" ADD CONSTRAINT "Inlink_toInternalLinkId_fkey" FOREIGN KEY ("toInternalLinkId") REFERENCES "public"."InternalLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inlink" ADD CONSTRAINT "Inlink_toExternalLinkId_fkey" FOREIGN KEY ("toExternalLinkId") REFERENCES "public"."ExternalLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
