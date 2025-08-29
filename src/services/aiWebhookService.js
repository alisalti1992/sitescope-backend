const { PrismaClient } = require("@prisma/client");

/**
 * AI Webhook Service
 * 
 * Handles sending internal link crawl data to external AI services
 * for generating AI readability reports when the AI parameter is enabled.
 */
class AIWebhookService {
  constructor() {
    this.prisma = new PrismaClient();
    this.pageAnalyzerUrl = process.env.PAGE_ANALYZER_WEBHOOK_URL || null;
    this.crawlAnalyzerUrl = process.env.CRAWL_ANALYZER_WEBHOOK_URL || null;
    this.webhookTimeout = parseInt(process.env.AI_WEBHOOK_TIMEOUT) || 30000; // 30 seconds
    this.maxRetries = parseInt(process.env.AI_WEBHOOK_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.AI_WEBHOOK_RETRY_DELAY) || 5000; // 5 seconds
  }

  // ==================== MAIN WEBHOOK FLOW ====================

  /**
   * Process AI report generation for a completed crawl job
   * @param {number} jobId - The ID of the completed crawl job
   */
  async processAIReport(jobId) {
    if (!this.pageAnalyzerUrl || !this.crawlAnalyzerUrl) {
      console.log(`⚠️ AI webhook URLs not configured, skipping AI report for job ${jobId}`);
      return;
    }

    try {
      const job = await this.prisma.crawlJob.findUnique({
        where: { id: jobId },
        include: { internalLinks: true, sitemaps: true },
      });

      if (!job || !job.ai) {
        console.log(`📊 AI report not requested or job not found for job ${jobId}, skipping`);
        return;
      }

      if (job.internalLinks.length === 0) {
        console.log(`📊 No internal links found for job ${jobId}, skipping AI report`);
        await this.updateAIReportStatus(jobId, 'not_requested', null, 'No internal links to analyze');
        return;
      }

      console.log(`🤖 Starting AI report generation for job ${jobId} with ${job.internalLinks.length} pages`);
      await this.updateAIReportStatus(jobId, 'pending');

      // Step 1: Perform page-level analysis in parallel
      await this.processAllPages(job);

      // Step 2: Perform crawl-level analysis
      await this.processCrawlAnalysis(job);

      console.log(`✅ AI report generated successfully for job ${jobId}`);
    } catch (error) {
      console.error(`❌ AI report generation failed for job ${jobId}:`, error.message);
      await this.updateAIReportStatus(jobId, 'failed', null, error.message);
    }
  }

  async processAllPages(job) {
    const promises = job.internalLinks.map(link => this.processPageAnalysis(link, job));
    await Promise.all(promises);
  }

  async processPageAnalysis(link, job) {
    try {
      await this.prisma.internalLink.update({
        where: { id: link.id },
        data: { pageAnalysisStatus: 'pending', pageAnalysisStartedAt: new Date() },
      });

      const payload = this.buildPageWebhookPayload(link, job);
      const analysisData = await this.sendWebhookWithRetry(payload, link.jobId, this.pageAnalyzerUrl);

      await this.prisma.internalLink.update({
        where: { id: link.id },
        data: {
          pageAnalysisStatus: 'completed',
          pageAnalysisData: analysisData,
          pageAnalysisCompletedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.internalLink.update({
        where: { id: link.id },
        data: {
          pageAnalysisStatus: 'failed',
          pageAnalysisError: error.message,
          pageAnalysisCompletedAt: new Date(),
        },
      });
    }
  }

  async processCrawlAnalysis(job) {
    try {
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { crawlAnalysisStatus: 'pending', crawlAnalysisStartedAt: new Date() },
      });

      const payload = await this.buildCrawlWebhookPayload(job);
      const analysisData = await this.sendWebhookWithRetry(payload, job.id, this.crawlAnalyzerUrl);

      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          crawlAnalysisStatus: 'completed',
          crawlAnalysisData: analysisData,
          crawlAnalysisCompletedAt: new Date(),
          aiReportStatus: 'completed',
          aiReportData: analysisData,
          aiReportGeneratedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          crawlAnalysisStatus: 'failed',
          crawlAnalysisError: error.message,
          crawlAnalysisCompletedAt: new Date(),
        },
      });
    }
  }

  // ==================== WEBHOOK PAYLOAD CONSTRUCTION ====================

  /**
   * Build the webhook payload containing crawl data
   * @param {Object} job - The crawl job with internal links
   * @returns {Object} Webhook payload
   */
  buildPageWebhookPayload(link, job) {
    return {
      jobId: link.jobId,
      pageId: link.id,
      pageContent: link.htmlContent,
      crawlMetadata: {
        url: link.address,
        title: link.title,
        metaDescription: link.metaDescription,
        h1: link.h1,
        wordCount: link.wordCount,
        fleschReadingEaseScore: link.fleschReadingEaseScore,
      },
      robotsTxt: job.robotsTxtContent,
      sitemap: job.sitemaps.map(s => s.content).join('\n'),
    };
  }

  async buildCrawlWebhookPayload(job) {
    const pageAnalyses = await this.prisma.internalLink.findMany({
      where: { jobId: job.id, pageAnalysisStatus: 'completed' },
      select: { address: true, title: true, pageAnalysisData: true },
    });

    return {
      sitemaps: job.sitemaps.map(s => s.content).join('\n'),
      robotsTxt: job.robotsTxtContent,
      crawlMetadata: {
        totalPagesCrawled: job.pagesCrawled,
        averagePageLoadSpeed: null, // TODO: Calculate average page load speed
      },
      aggregatedPageAnalysisResults: pageAnalyses.map(p => ({
        url: p.address,
        title: p.title,
        analysis: p.pageAnalysisData,
      })),
    };
  }

  async sendWebhookWithRetry(payload, jobId, url) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Sending AI webhook request (attempt ${attempt}/${this.maxRetries}) for job ${jobId}`);
        const response = await this.sendWebhookRequest(payload, url);
        console.log(`✅ AI webhook request successful for job ${jobId}`);
        return response;
      } catch (error) {
        lastError = error;
        console.error(`❌ AI webhook attempt ${attempt} failed for job ${jobId}:`, error.message);
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`AI webhook failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  async sendWebhookRequest(payload, url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.webhookTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SiteScope-AI-Webhook/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }

      const aiReport = await response.json();
      this.validateAIReportResponse(aiReport);
      return aiReport;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Validate the AI report response structure
   * @param {Object} report - The AI report to validate
   */
  validateAIReportResponse(report) {
    if (!report || typeof report !== 'object') {
      throw new Error('AI report response must be a JSON object');
    }

    // Basic validation - the external service can return any structure
    // but we expect at least some data
    if (Object.keys(report).length === 0) {
      throw new Error('AI report response is empty');
    }

    // Log the report structure for debugging
    console.log(`📊 AI report contains keys: ${Object.keys(report).join(', ')}`);
  }

  // ==================== DATABASE OPERATIONS ====================

  /**
   * Update the AI report status in the database
   * @param {number} jobId - Job ID
   * @param {string} status - Status (pending, completed, failed, not_requested)
   * @param {Object} reportData - AI report JSON data (optional)
   * @param {string} errorMessage - Error message (optional)
   */
  async updateAIReportStatus(jobId, status, reportData = null, errorMessage = null) {
    const updateData = {
      aiReportStatus: status
    };

    if (status === 'completed' && reportData) {
      updateData.aiReportData = reportData;
      updateData.aiReportGeneratedAt = new Date();
      updateData.aiReportError = null; // Clear any previous error
    }

    if (status === 'failed' && errorMessage) {
      updateData.aiReportError = errorMessage;
    }

    if (status === 'not_requested' && errorMessage) {
      updateData.aiReportError = errorMessage;
    }

    await this.prisma.crawlJob.update({
      where: { id: jobId },
      data: updateData
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Delay execution for a specified number of milliseconds
   * @param {number} ms - Milliseconds to delay
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if webhook is configured
   * @returns {boolean} True if webhook URL is configured
   */
  isConfigured() {
    return !!this.pageAnalyzerUrl && !!this.crawlAnalyzerUrl;
  }

  /**
   * Get webhook configuration info
   * @returns {Object} Configuration details
   */
  getConfig() {
    return {
      pageAnalyzerUrl: this.pageAnalyzerUrl ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      crawlAnalyzerUrl: this.crawlAnalyzerUrl ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      timeout: this.webhookTimeout,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    };
  }

  /**
   * Clean up resources
   */
  async close() {
    await this.prisma.$disconnect();
  }
}

module.exports = AIWebhookService;