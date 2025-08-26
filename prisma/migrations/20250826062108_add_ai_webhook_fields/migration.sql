/*
  Warnings:

  - You are about to drop the column `samplingStrategy` on the `CrawlJob` table. All the data in the column will be lost.
  - You are about to drop the column `useSampling` on the `CrawlJob` table. All the data in the column will be lost.
  - You are about to drop the `AiReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."AiReport" DROP CONSTRAINT "AiReport_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."CrawlJob" DROP COLUMN "samplingStrategy",
DROP COLUMN "useSampling",
ADD COLUMN     "aiReportData" JSONB,
ADD COLUMN     "aiReportError" TEXT,
ADD COLUMN     "aiReportGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "aiReportStatus" TEXT,
ADD COLUMN     "sampledCrawl" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "public"."AiReport";
