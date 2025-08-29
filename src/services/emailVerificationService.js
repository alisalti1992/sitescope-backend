const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();

/**
 * Email Verification Service for Crawl Jobs
 * 
 * Handles:
 * - Generating secure verification codes
 * - Sending verification emails
 * - Validating verification codes
 * - Rate limiting verification attempts
 * - Managing verification lifecycle
 */
class EmailVerificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
    
    // Configuration constants
    this.CODE_LENGTH = 6;
    this.CODE_EXPIRY_HOURS = 24;
    this.MAX_ATTEMPTS = 5;
    this.RATE_LIMIT_WINDOW_MINUTES = 15;
    this.RATE_LIMIT_MAX_ATTEMPTS = 3;
  }

  /**
   * Initialize SMTP transporter (reuse from existing email service)
   */
  initializeTransporter() {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_SECURE
    } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.warn('⚠️ SMTP not configured. Email verification will not work.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: SMTP_SECURE === 'true',
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      });

      console.log('📧 Email verification service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize email verification service:', error.message);
      this.transporter = null;
    }
  }

  /**
   * Generate a secure 6-digit verification code
   */
  generateVerificationCode() {
    // Generate cryptographically secure random 6-digit code
    const buffer = crypto.randomBytes(3);
    const code = parseInt(buffer.toString('hex'), 16) % 1000000;
    return code.toString().padStart(6, '0');
  }

  /**
   * Send verification email for a crawl job
   * @param {number} jobId - The job ID requiring verification
   * @returns {Object} Result with success status and details
   */
  async sendVerificationEmail(jobId) {
    if (!this.transporter) {
      return { 
        success: false, 
        error: 'Email service not configured' 
      };
    }

    try {
      // Get job details
      const job = await prisma.crawlJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        return { 
          success: false, 
          error: 'Job not found' 
        };
      }

      if (!job.requireEmailVerification) {
        return { 
          success: false, 
          error: 'Email verification not required for this job' 
        };
      }

      if (job.isEmailVerified) {
        return { 
          success: false, 
          error: 'Email already verified' 
        };
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(jobId);
      if (!rateLimitCheck.allowed) {
        return { 
          success: false, 
          error: `Rate limit exceeded. Try again in ${rateLimitCheck.retryAfterMinutes} minutes.` 
        };
      }

      // Generate new verification code
      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.CODE_EXPIRY_HOURS);

      // Update job with verification code
      await prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          emailVerificationCode: verificationCode,
          emailVerificationCodeSentAt: new Date(),
          emailVerificationCodeExpiresAt: expiresAt,
          status: 'waiting_verification'
        }
      });

      // Send verification email
      const emailContent = this.generateVerificationEmail(job, verificationCode);
      
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'SiteScope <noreply@sitescope.com>',
        to: job.email,
        subject: `Verify your crawl job - Code: ${verificationCode}`,
        text: emailContent.text,
        html: emailContent.html
      });

      console.log(`✅ Verification email sent for job ${jobId} to ${job.email}`);
      
      return { 
        success: true, 
        message: 'Verification email sent successfully',
        expiresAt: expiresAt.toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to send verification email for job ${jobId}:`, error);
      return { 
        success: false, 
        error: 'Failed to send verification email' 
      };
    }
  }

  /**
   * Verify the provided code for a job
   * @param {number} jobId - The job ID
   * @param {string} code - The verification code provided by user
   * @returns {Object} Verification result
   */
  async verifyCode(jobId, code) {
    try {
      const job = await prisma.crawlJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        return { 
          success: false, 
          error: 'Job not found' 
        };
      }

      if (!job.requireEmailVerification) {
        return { 
          success: false, 
          error: 'Email verification not required for this job' 
        };
      }

      if (job.isEmailVerified) {
        return { 
          success: false, 
          error: 'Email already verified' 
        };
      }

      // Check if too many attempts
      if (job.emailVerificationAttempts >= this.MAX_ATTEMPTS) {
        return { 
          success: false, 
          error: 'Maximum verification attempts exceeded. Please request a new code.' 
        };
      }

      // Increment attempt counter
      await prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          emailVerificationAttempts: job.emailVerificationAttempts + 1
        }
      });

      // Check if code exists
      if (!job.emailVerificationCode) {
        return { 
          success: false, 
          error: 'No verification code found. Please request a new code.' 
        };
      }

      // Check if code expired
      if (new Date() > job.emailVerificationCodeExpiresAt) {
        return { 
          success: false, 
          error: 'Verification code has expired. Please request a new code.' 
        };
      }

      // Verify code
      const normalizedInputCode = code.toString().trim();
      const normalizedStoredCode = job.emailVerificationCode.trim();

      if (normalizedInputCode !== normalizedStoredCode) {
        return { 
          success: false, 
          error: `Invalid verification code. ${this.MAX_ATTEMPTS - job.emailVerificationAttempts - 1} attempts remaining.` 
        };
      }

      // Code is valid - mark as verified
      await prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          status: 'pending', // Move back to pending so crawler can pick it up
          // Clear verification data
          emailVerificationCode: null,
          emailVerificationCodeSentAt: null,
          emailVerificationCodeExpiresAt: null
        }
      });

      console.log(`✅ Email verified for job ${jobId}`);
      
      return { 
        success: true, 
        message: 'Email verified successfully. Your crawl job will start processing shortly.' 
      };

    } catch (error) {
      console.error(`❌ Error verifying code for job ${jobId}:`, error);
      return { 
        success: false, 
        error: 'Verification failed due to server error' 
      };
    }
  }

  /**
   * Check rate limiting for verification email sending
   * @param {number} jobId - The job ID
   * @returns {Object} Rate limit check result
   */
  async checkRateLimit(jobId) {
    try {
      const job = await prisma.crawlJob.findUnique({
        where: { id: jobId }
      });

      if (!job || !job.emailVerificationCodeSentAt) {
        return { allowed: true };
      }

      const rateLimitWindow = new Date();
      rateLimitWindow.setMinutes(rateLimitWindow.getMinutes() - this.RATE_LIMIT_WINDOW_MINUTES);

      // Check if last email was sent within rate limit window
      if (job.emailVerificationCodeSentAt > rateLimitWindow) {
        const nextAllowedTime = new Date(job.emailVerificationCodeSentAt);
        nextAllowedTime.setMinutes(nextAllowedTime.getMinutes() + this.RATE_LIMIT_WINDOW_MINUTES);
        
        const retryAfterMinutes = Math.ceil((nextAllowedTime - new Date()) / (1000 * 60));
        
        return { 
          allowed: false, 
          retryAfterMinutes 
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      return { allowed: true }; // Allow on error to avoid blocking
    }
  }

  /**
   * Generate verification email content
   * @param {Object} job - The crawl job
   * @param {string} verificationCode - The verification code
   * @returns {Object} Email content with text and html
   */
  generateVerificationEmail(job, verificationCode) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify/${job.id}`;

    const text = `
Verify Your Crawl Job - SiteScope

Hello!

You've requested a crawl analysis for: ${job.url}

To start your crawl job, please verify your email address using this 6-digit code:

${verificationCode}

You can also verify by visiting: ${verifyUrl}

This code will expire in 24 hours.

If you didn't request this crawl, you can safely ignore this email.

---
SiteScope Crawler
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify Your Crawl Job</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #EC3737, #b91c1c); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; }
    .content { padding: 32px 24px; }
    .verification-code { background: #f8f9fa; border: 2px dashed #EC3737; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0; }
    .code-display { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #EC3737; font-family: 'Courier New', monospace; }
    .code-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
    .website-info { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #EC3737; }
    .cta-button { display: inline-block; background: #EC3737; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; text-align: center; margin: 20px 0; }
    .cta-button:hover { background: #b91c1c; }
    .footer { background: #f8f9fa; padding: 16px 24px; text-align: center; font-size: 12px; color: #6b7280; }
    .expiry-info { color: #ea580c; font-weight: 600; margin: 16px 0; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Verify Your Email</h1>
      <p>Complete your crawl job setup</p>
    </div>
    
    <div class="content">
      <p>Hello!</p>
      
      <p>You've requested a crawl analysis for:</p>
      
      <div class="website-info">
        <strong>🌐 ${job.url}</strong><br>
        <small>Max pages: ${job.maxPages} | AI Analysis: ${job.ai ? 'Yes' : 'No'}</small>
      </div>
      
      <p>To start your crawl job, please verify your email address using this 6-digit code:</p>
      
      <div class="verification-code">
        <div class="code-label">Your Verification Code</div>
        <div class="code-display">${verificationCode}</div>
      </div>
      
      <div style="text-align: center;">
        <a href="${verifyUrl}" class="cta-button">🔗 Verify Online</a>
      </div>
      
      <div class="expiry-info">
        ⏰ This code expires in 24 hours
      </div>
      
      <p><small>If you didn't request this crawl, you can safely ignore this email.</small></p>
    </div>

    <div class="footer">
      Powered by SiteScope | Secure Web Crawling & Analysis
    </div>
  </div>
</body>
</html>
    `.trim();

    return { text, html };
  }

  /**
   * Resend verification code (with rate limiting)
   * @param {number} jobId - The job ID
   * @returns {Object} Resend result
   */
  async resendVerificationCode(jobId) {
    try {
      const job = await prisma.crawlJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        return { 
          success: false, 
          error: 'Job not found' 
        };
      }

      if (job.isEmailVerified) {
        return { 
          success: false, 
          error: 'Email already verified' 
        };
      }

      // Reset attempt counter when sending new code
      await prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          emailVerificationAttempts: 0
        }
      });

      return await this.sendVerificationEmail(jobId);

    } catch (error) {
      console.error(`❌ Error resending code for job ${jobId}:`, error);
      return { 
        success: false, 
        error: 'Failed to resend verification code' 
      };
    }
  }

  /**
   * Clean up expired verification codes
   * @returns {number} Number of jobs cleaned up
   */
  async cleanupExpiredCodes() {
    try {
      // Find expired unverified jobs
      const expiredJobs = await prisma.crawlJob.findMany({
        where: {
          isEmailVerified: false,
          requireEmailVerification: true,
          emailVerificationCodeExpiresAt: {
            lt: new Date()
          },
          status: 'waiting_verification'
        }
      });

      if (expiredJobs.length === 0) {
        return 0;
      }

      // Update expired jobs to failed status
      const result = await prisma.crawlJob.updateMany({
        where: {
          id: { in: expiredJobs.map(job => job.id) }
        },
        data: {
          status: 'failed',
          errorMessage: 'Email verification expired',
          emailVerificationCode: null,
          emailVerificationCodeSentAt: null,
          emailVerificationCodeExpiresAt: null
        }
      });

      console.log(`🧹 Cleaned up ${result.count} expired verification codes`);
      return result.count;

    } catch (error) {
      console.error('❌ Error cleaning up expired codes:', error);
      return 0;
    }
  }

  /**
   * Get verification status for a job
   * @param {number} jobId - The job ID
   * @returns {Object} Verification status
   */
  async getVerificationStatus(jobId) {
    try {
      const job = await prisma.crawlJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          requireEmailVerification: true,
          isEmailVerified: true,
          emailVerifiedAt: true,
          emailVerificationCodeSentAt: true,
          emailVerificationCodeExpiresAt: true,
          emailVerificationAttempts: true,
          status: true,
          email: true
        }
      });

      if (!job) {
        return { 
          success: false, 
          error: 'Job not found' 
        };
      }

      const now = new Date();
      const isCodeExpired = job.emailVerificationCodeExpiresAt ? 
        now > job.emailVerificationCodeExpiresAt : false;

      return {
        success: true,
        status: {
          requiresVerification: job.requireEmailVerification,
          isVerified: job.isEmailVerified,
          verifiedAt: job.emailVerifiedAt,
          codeSentAt: job.emailVerificationCodeSentAt,
          codeExpiresAt: job.emailVerificationCodeExpiresAt,
          isCodeExpired,
          attemptsMade: job.emailVerificationAttempts,
          attemptsRemaining: Math.max(0, this.MAX_ATTEMPTS - job.emailVerificationAttempts),
          canRequestNewCode: isCodeExpired || job.emailVerificationAttempts >= this.MAX_ATTEMPTS,
          jobStatus: job.status,
          email: job.email
        }
      };

    } catch (error) {
      console.error(`❌ Error getting verification status for job ${jobId}:`, error);
      return { 
        success: false, 
        error: 'Failed to get verification status' 
      };
    }
  }

  /**
   * Close service and cleanup
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
    }
    await prisma.$disconnect();
  }
}

module.exports = EmailVerificationService;