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
    this.webhookUrl = process.env.AI_WEBHOOK_URL || null;
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
    if (!this.webhookUrl) {
      console.log(`⚠️ AI webhook URL not configured, skipping AI report for job ${jobId}`);
      return;
    }

    try {
      // Get job details and check if AI report is requested
      const job = await this.prisma.crawlJob.findUnique({
        where: { id: jobId },
        include: { internalLinks: true }
      });

      if (!job) {
        console.error(`❌ Job ${jobId} not found for AI report generation`);
        return;
      }

      if (!job.ai) {
        console.log(`📊 AI report not requested for job ${jobId}, skipping`);
        return;
      }

      if (job.internalLinks.length === 0) {
        console.log(`📊 No internal links found for job ${jobId}, skipping AI report`);
        await this.updateAIReportStatus(jobId, 'not_requested', null, 'No internal links to analyze');
        return;
      }

      console.log(`🤖 Starting AI report generation for job ${jobId} with ${job.internalLinks.length} pages`);
      
      // Mark AI report as pending
      await this.updateAIReportStatus(jobId, 'pending');

      // Prepare and send webhook payload
      const payload = this.buildWebhookPayload(job);
      const aiReport = await this.sendWebhookWithRetry(payload, jobId);

      // Store the AI report
      await this.updateAIReportStatus(jobId, 'completed', aiReport);
      
      console.log(`✅ AI report generated successfully for job ${jobId}`);

    } catch (error) {
      console.error(`❌ AI report generation failed for job ${jobId}:`, error.message);
      await this.updateAIReportStatus(jobId, 'failed', null, error.message);
    }
  }

  // ==================== WEBHOOK PAYLOAD CONSTRUCTION ====================

  /**
   * Build the webhook payload containing crawl data
   * @param {Object} job - The crawl job with internal links
   * @returns {Object} Webhook payload
   */
  buildWebhookPayload(job) {
    const payload = {
      jobId: job.id,
      jobInfo: {
        url: job.url,
        maxPages: job.maxPages,
        pagesCrawled: job.pagesCrawled,
        completedAt: job.completedAt,
        sampledCrawl: job.sampledCrawl
      },
      internalLinks: job.internalLinks.map(link => this.formatLinkForWebhook(link)),
      metadata: {
        totalPages: job.internalLinks.length,
        crawlType: job.sampledCrawl ? 'sampled' : 'full',
        requestedAt: new Date().toISOString(),
        version: '1.0'
      }
    };

    return payload;
  }

  /**
   * Format a single internal link for the webhook payload
   * @param {Object} link - Internal link data
   * @returns {Object} Formatted link data
   */
  formatLinkForWebhook(link) {
    return {
      // Basic Info
      url: link.address,
      statusCode: link.statusCode,
      contentType: link.contentType,
      indexability: link.indexability,
      
      // Content Data
      title: link.title,
      metaDescription: link.metaDescription,
      h1: link.h1,
      metaRobots: link.metaRobots,
      language: link.language,
      
      // Content Analysis
      wordCount: link.wordCount,
      sentenceCount: link.sentenceCount,
      avgWordsPerSentence: link.avgWordsPerSentence,
      fleschReadingEaseScore: link.fleschReadingEaseScore,
      readability: link.readability,
      textRatio: link.textRatio,
      
      // Size & Performance
      sizeBytes: link.sizeBytes,
      responseTime: link.responseTime,
      
      // Structure
      crawlDepth: link.crawlDepth,
      folderDepth: link.folderDepth,
      
      // Links
      inlinks: link.inlinks,
      outlinks: link.outlinks,
      externalOutlinks: link.externalOutlinks,
      
      // Technical
      canonicalUrl: link.canonicalLinkElement,
      
      // Timestamps
      crawledAt: link.crawlTimestamp,
      
      // Raw content (optional, can be large)
      hasHtmlContent: !!link.htmlContent,
      // Include first 1000 characters for analysis
      htmlPreview: link.htmlContent ? link.htmlContent.substring(0, 1000) : null
    };
  }

  // ==================== WEBHOOK COMMUNICATION ====================

  /**
   * Send webhook request with retry logic
   * @param {Object} payload - The payload to send
   * @param {number} jobId - Job ID for logging
   * @returns {Object} AI report JSON
   */
  async sendWebhookWithRetry(payload, jobId) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Sending AI webhook request (attempt ${attempt}/${this.maxRetries}) for job ${jobId}`);
        
        const response = await this.sendWebhookRequest(payload);
        
        console.log(`✅ AI webhook request successful for job ${jobId}`);
        return response;

      } catch (error) {
        lastError = error;
        console.error(`❌ AI webhook attempt ${attempt} failed for job ${jobId}:`, error.message);
        
        // Wait before retry (except on last attempt)
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw new Error(`AI webhook failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Send a single webhook request
   * @param {Object} payload - The payload to send
   * @returns {Object} Parsed JSON response
   */
  async sendWebhookRequest(payload) {
    // Use Node.js built-in fetch (available in v18+)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.webhookTimeout);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SiteScope-AI-Webhook/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
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
      
      // Validate the response structure
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
    return !!this.webhookUrl;
  }

  /**
   * Get webhook configuration info
   * @returns {Object} Configuration details
   */
  getConfig() {
    return {
      webhookUrl: this.webhookUrl ? '[CONFIGURED]' : '[NOT CONFIGURED]',
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