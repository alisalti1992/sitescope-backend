const nodemailer = require('nodemailer');
const { PrismaClient } = require("@prisma/client");

/**
 * Email Service for sending crawl job completion reports
 * 
 * Features:
 * - SMTP configuration via environment variables
 * - Email report delivery with job completion notifications
 * - Support for both plain text and HTML emails
 * - Error handling and retry logic for failed deliveries
 * - Report links to frontend for detailed viewing
 */
class EmailService {
  constructor() {
    this.prisma = new PrismaClient();
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize SMTP transporter based on environment configuration
   */
  initializeTransporter() {
    const {
      FEATURE_EMAIL_REPORTS,
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_SECURE
    } = process.env;

    if (!FEATURE_EMAIL_REPORTS || FEATURE_EMAIL_REPORTS !== 'true') {
      console.log('📧 Email reports feature is disabled');
      return;
    }

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.warn('⚠️ Missing SMTP configuration. Email reports will not be sent.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      });

      console.log('📧 Email service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error.message);
      this.transporter = null;
    }
  }

  /**
   * Send email report for completed crawl job
   * @param {number} jobId - The completed job ID
   * @param {string} recipient - Optional recipient email (overrides default BCC)
   */
  async sendJobCompletionReport(jobId, recipient = null) {
    if (!this.transporter) {
      console.log('📧 Email service not configured, skipping email report');
      return { success: false, reason: 'Email service not configured' };
    }

    try {
      // Get job details and statistics
      const jobData = await this.getJobReportData(jobId);
      if (!jobData) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Generate report content
      const emailContent = this.generateEmailContent(jobData);
      
      // Determine recipient
      const toEmail = recipient || process.env.SMTP_BCC;
      if (!toEmail) {
        throw new Error('No recipient email configured');
      }

      // Send email with retry logic
      const result = await this.sendEmailWithRetry({
        from: process.env.SMTP_FROM || 'SiteScope Crawler <noreply@sitescope.com>',
        to: toEmail,
        subject: `Crawl Completed: ${jobData.url} - ${jobData.pagesCrawled} pages analyzed`,
        text: emailContent.text,
        html: emailContent.html
      });

      console.log(`✅ Email report sent successfully for job ${jobId} to ${toEmail}`);
      return { success: true, recipient: toEmail };

    } catch (error) {
      console.error(`❌ Failed to send email report for job ${jobId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get job data and statistics for report generation
   * @param {number} jobId - The job ID
   * @returns {Object} Job data with statistics
   */
  async getJobReportData(jobId) {
    try {
      const job = await this.prisma.crawlJob.findUnique({
        where: { id: jobId },
        include: {
          internalLinks: {
            select: {
              address: true,
              title: true,
              statusCode: true,
              sizeBytes: true,
              responseTime: true,
              wordCount: true,
              linkScore: true,
              crawlTimestamp: true
            },
            orderBy: { linkScore: 'desc' },
            take: 10 // Top 10 pages for email summary
          },
          externalLinks: {
            select: { address: true },
            take: 5 // Top 5 external domains
          }
        }
      });

      if (!job) return null;

      // Calculate statistics
      const stats = await this.calculateJobStatistics(jobId);
      
      return {
        ...job,
        statistics: stats,
        reportUrl: this.generateReportUrl(jobId)
      };

    } catch (error) {
      console.error(`❌ Error fetching job data for ${jobId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate job statistics for report
   * @param {number} jobId - The job ID
   * @returns {Object} Calculated statistics
   */
  async calculateJobStatistics(jobId) {
    try {
      const [
        totalPages,
        avgResponseTime,
        totalWords,
        avgWordsPerPage,
        statusCodes,
        indexablePages,
        avgPageSize
      ] = await Promise.all([
        this.prisma.internalLink.count({ where: { jobId } }),
        this.prisma.internalLink.aggregate({
          where: { jobId },
          _avg: { responseTime: true }
        }),
        this.prisma.internalLink.aggregate({
          where: { jobId },
          _sum: { wordCount: true }
        }),
        this.prisma.internalLink.aggregate({
          where: { jobId },
          _avg: { wordCount: true }
        }),
        this.prisma.internalLink.groupBy({
          by: ['statusCode'],
          where: { jobId },
          _count: { statusCode: true }
        }),
        this.prisma.internalLink.count({
          where: { jobId, indexability: 'Indexable' }
        }),
        this.prisma.internalLink.aggregate({
          where: { jobId },
          _avg: { sizeBytes: true }
        })
      ]);

      return {
        totalPages,
        avgResponseTime: Math.round(avgResponseTime._avg?.responseTime || 0),
        totalWords: totalWords._sum?.wordCount || 0,
        avgWordsPerPage: Math.round(avgWordsPerPage._avg?.wordCount || 0),
        indexablePages,
        nonIndexablePages: totalPages - indexablePages,
        avgPageSize: Math.round(avgPageSize._avg?.sizeBytes || 0),
        statusCodeBreakdown: statusCodes.reduce((acc, item) => {
          acc[item.statusCode] = item._count.statusCode;
          return acc;
        }, {})
      };

    } catch (error) {
      console.error(`❌ Error calculating statistics for job ${jobId}:`, error.message);
      return {};
    }
  }

  /**
   * Generate report URL for frontend viewing
   * @param {number} jobId - The job ID
   * @returns {string} Full URL to job report
   */
  generateReportUrl(jobId) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${frontendUrl}/reports/${jobId}`;
  }

  /**
   * Generate email content (both text and HTML)
   * @param {Object} jobData - Job data with statistics
   * @returns {Object} Email content with text and html properties
   */
  generateEmailContent(jobData) {
    const fs = require('fs');
    const path = require('path');

    const duration = this.calculateDuration(jobData.startedAt, jobData.completedAt);
    const stats = jobData.statistics;

    const textTemplate = fs.readFileSync(path.join(__dirname, '../../views/emails/jobCompletionEmail.txt'), 'utf8');
    const htmlTemplate = fs.readFileSync(path.join(__dirname, '../../views/emails/jobCompletionEmail.html'), 'utf8');

    const replacements = {
      projectName: process.env.PROJECT_NAME || 'SiteScope',
      url: jobData.url,
      status: jobData.status,
      duration,
      pagesCrawled: jobData.pagesCrawled,
      maxPages: jobData.maxPages,
      totalWords: (stats.totalWords || 0).toLocaleString(),
      avgResponseTime: stats.avgResponseTime || 0,
      indexablePages: stats.indexablePages || 0,
      nonIndexablePages: stats.nonIndexablePages || 0,
      topPages: jobData.internalLinks.slice(0, 5).map((page, index) => 
        `${index + 1}. ${page.title || page.address} (Score: ${page.linkScore || 0})`
      ).join('\n'),
      reportUrl: jobData.reportUrl,
      generatedAt: new Date().toLocaleString(),
    };

    const text = textTemplate.replace(/{{(.*?)}}/g, (match, key) => replacements[key.trim()]);
    const html = htmlTemplate.replace(/{{(.*?)}}/g, (match, key) => {
      if (key.trim() === 'topPages') {
        return jobData.internalLinks.slice(0, 5).map(page => `
          <li class="page-item">
            <p class="page-title">${page.title || 'Untitled'}</p>
            <p class="page-url">${page.address}</p>
          </li>
        `).join('');
      }
      return replacements[key.trim()];
    });

    return { text, html };
  }

  /**
   * Calculate duration between two dates
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {string} Formatted duration
   */
  calculateDuration(startDate, endDate) {
    if (!startDate || !endDate) return 'N/A';
    
    const durationMs = new Date(endDate) - new Date(startDate);
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Send email with retry logic
   * @param {Object} mailOptions - Nodemailer mail options
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise} Send result
   */
  async sendEmailWithRetry(mailOptions, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.transporter.sendMail(mailOptions);
        console.log(`📧 Email sent successfully on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`❌ Email attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Exponential backoff, max 30s
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Test email configuration
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async testEmailConfiguration() {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP configuration is valid');
      return true;
    } catch (error) {
      console.error('❌ SMTP configuration test failed:', error.message);
      return false;
    }
  }

  /**
   * Close the email service and cleanup resources
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
    }
    await this.prisma.$disconnect();
  }
}

module.exports = EmailService;