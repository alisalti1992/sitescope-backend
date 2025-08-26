-- AlterTable
ALTER TABLE "public"."CrawlJob" ADD COLUMN     "samplingStrategy" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "useSampling" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."AiReport" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "samplingMethod" TEXT,
    "pagesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "siteType" TEXT,
    "overallSeoScore" INTEGER,
    "keyFindings" JSONB,
    "recommendations" JSONB,
    "technicalIssues" JSONB,
    "contentAnalysis" JSONB,
    "performanceScore" INTEGER,
    "summary" TEXT,
    "fullReport" TEXT,
    "aiModel" TEXT,
    "generationTime" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReport_jobId_idx" ON "public"."AiReport"("jobId");

-- CreateIndex
CREATE INDEX "AiReport_status_idx" ON "public"."AiReport"("status");

-- AddForeignKey
ALTER TABLE "public"."AiReport" ADD CONSTRAINT "AiReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
