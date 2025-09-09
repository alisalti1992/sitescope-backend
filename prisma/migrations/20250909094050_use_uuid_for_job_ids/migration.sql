/*
  Warnings:

  - The primary key for the `CrawlJob` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `CrawlJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `jobId` on the `ExternalLink` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `jobId` on the `Inlink` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `jobId` on the `InternalLink` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'STANDARD');

-- DropForeignKey
ALTER TABLE "public"."ExternalLink" DROP CONSTRAINT "ExternalLink_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Inlink" DROP CONSTRAINT "Inlink_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InternalLink" DROP CONSTRAINT "InternalLink_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."CrawlJob" DROP CONSTRAINT "CrawlJob_pkey",
ADD COLUMN     "crawlAnalysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "crawlAnalysisData" JSONB,
ADD COLUMN     "crawlAnalysisError" TEXT,
ADD COLUMN     "crawlAnalysisStartedAt" TIMESTAMP(3),
ADD COLUMN     "crawlAnalysisStatus" TEXT,
ADD COLUMN     "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "emailVerificationCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationCodeSentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireEmailVerification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "robotsTxtContent" TEXT,
ADD COLUMN     "robotsTxtFetchedAt" TIMESTAMP(3),
ADD COLUMN     "robotsTxtResponseTime" INTEGER,
ADD COLUMN     "robotsTxtStatusCode" INTEGER,
ADD COLUMN     "robotsTxtUrl" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."ExternalLink" DROP COLUMN "jobId",
ADD COLUMN     "jobId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "public"."Inlink" DROP COLUMN "jobId",
ADD COLUMN     "jobId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "public"."InternalLink" ADD COLUMN     "pageAnalysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "pageAnalysisData" JSONB,
ADD COLUMN     "pageAnalysisError" TEXT,
ADD COLUMN     "pageAnalysisStartedAt" TIMESTAMP(3),
ADD COLUMN     "pageAnalysisStatus" TEXT,
DROP COLUMN "jobId",
ADD COLUMN     "jobId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "role" "public"."UserRole" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "public"."ApiToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sitemap" (
    "id" SERIAL NOT NULL,
    "jobId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "parentSitemapId" INTEGER,
    "content" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "urlCount" INTEGER NOT NULL DEFAULT 0,
    "urls" JSONB,
    "lastMod" TIMESTAMP(3),
    "changeFreq" TEXT,
    "priority" DOUBLE PRECISION,
    "discoveredFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sitemap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_token_key" ON "public"."ApiToken"("token");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "public"."ApiToken"("userId");

-- CreateIndex
CREATE INDEX "ApiToken_token_idx" ON "public"."ApiToken"("token");

-- CreateIndex
CREATE INDEX "Sitemap_jobId_idx" ON "public"."Sitemap"("jobId");

-- CreateIndex
CREATE INDEX "Sitemap_url_idx" ON "public"."Sitemap"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Sitemap_jobId_url_key" ON "public"."Sitemap"("jobId", "url");

-- CreateIndex
CREATE INDEX "ExternalLink_jobId_idx" ON "public"."ExternalLink"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalLink_jobId_address_key" ON "public"."ExternalLink"("jobId", "address");

-- CreateIndex
CREATE INDEX "Inlink_jobId_idx" ON "public"."Inlink"("jobId");

-- CreateIndex
CREATE INDEX "InternalLink_jobId_idx" ON "public"."InternalLink"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLink_jobId_address_key" ON "public"."InternalLink"("jobId", "address");

-- AddForeignKey
ALTER TABLE "public"."ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InternalLink" ADD CONSTRAINT "InternalLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalLink" ADD CONSTRAINT "ExternalLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inlink" ADD CONSTRAINT "Inlink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sitemap" ADD CONSTRAINT "Sitemap_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sitemap" ADD CONSTRAINT "Sitemap_parentSitemapId_fkey" FOREIGN KEY ("parentSitemapId") REFERENCES "public"."Sitemap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
