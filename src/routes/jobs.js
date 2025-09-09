const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authenticateToken, requireUser } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Create a new crawl job
 *     description: Creates a new web crawling job with the specified parameters and saves it to the database
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrawlJobRequest'
 *     responses:
 *       201:
 *         description: Crawl job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Crawl job created successfully"
 *                 job:
 *                   $ref: '#/components/schemas/CrawlJob'
 *       400:
 *         description: Bad request - missing or invalid fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missing_fields:
 *                 summary: Missing required fields
 *                 value:
 *                   error: "Missing required fields"
 *                   required: ["url", "maxPages", "ai", "email"]
 *               invalid_types:
 *                 summary: Invalid field types
 *                 value:
 *                   error: "Invalid field types"
 *                   expected:
 *                     url: "string"
 *                     maxPages: "number"
 *                     ai: "boolean"
 *                     email: "string"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post("/", authenticateToken, requireUser, async (req, res) => {
  try {
    const { url, maxPages, ai, email, takeScreenshots = true, sampledCrawl = false, ignoreUrlParameters = false, requireEmailVerification = true } = req.body;

    // Validate required fields
    if (!url || !maxPages || ai === undefined || !email) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["url", "maxPages", "ai", "email"]
      });
    }

    // Validate field types
    if (typeof url !== "string" || typeof maxPages !== "number" || typeof ai !== "boolean" || typeof email !== "string") {
      return res.status(400).json({
        error: "Invalid field types",
        expected: {
          url: "string",
          maxPages: "number", 
          ai: "boolean",
          email: "string",
          takeScreenshots: "boolean (optional, default: true)",
          ignoreUrlParameters: "boolean (optional, default: false)"
        }
      });
    }

    // Validate takeScreenshots if provided
    if (takeScreenshots !== undefined && typeof takeScreenshots !== "boolean") {
      return res.status(400).json({
        error: "Invalid field types",
        expected: {
          takeScreenshots: "boolean"
        }
      });
    }

    // Validate sampledCrawl if provided
    if (sampledCrawl !== undefined && typeof sampledCrawl !== "boolean") {
      return res.status(400).json({
        error: "Invalid field types",
        expected: {
          sampledCrawl: "boolean"
        }
      });
    }

    // Validate ignoreUrlParameters if provided
    if (ignoreUrlParameters !== undefined && typeof ignoreUrlParameters !== "boolean") {
      return res.status(400).json({
        error: "Invalid field types",
        expected: {
          ignoreUrlParameters: "boolean"
        }
      });
    }

    // Validate requireEmailVerification if provided
    if (requireEmailVerification !== undefined && typeof requireEmailVerification !== "boolean") {
      return res.status(400).json({
        error: "Invalid field types",
        expected: {
          requireEmailVerification: "boolean"
        }
      });
    }

    // Create crawl job in database
    // Note: robots.txt and sitemaps are always crawled automatically
    const crawlJob = await prisma.crawlJob.create({
      data: {
        url,
        maxPages,
        ai,
        email,
        takeScreenshots,
        crawlSitemap: true, // Always enabled now
        sampledCrawl,
        ignoreUrlParameters,
        requireEmailVerification
      }
    });

    // If email verification is required, send verification email
    if (requireEmailVerification) {
      const EmailVerificationService = require('../services/emailVerificationService');
      const verificationService = new EmailVerificationService();
      
      try {
        const verificationResult = await verificationService.sendVerificationEmail(crawlJob.id);
        
        if (verificationResult.success) {
          res.status(201).json({
            message: "Crawl job created successfully. Please check your email for verification code.",
            job: crawlJob,
            verification: {
              required: true,
              emailSent: true,
              expiresAt: verificationResult.expiresAt
            }
          });
        } else {
          res.status(201).json({
            message: "Crawl job created successfully, but verification email failed to send.",
            job: crawlJob,
            verification: {
              required: true,
              emailSent: false,
              error: verificationResult.error
            }
          });
        }
        
        await verificationService.close();
      } catch (error) {
        console.error('Error with verification email:', error);
        res.status(201).json({
          message: "Crawl job created successfully, but verification email failed to send.",
          job: crawlJob,
          verification: {
            required: true,
            emailSent: false,
            error: "Failed to send verification email"
          }
        });
      }
    } else {
      res.status(201).json({
        message: "Crawl job created successfully",
        job: crawlJob,
        verification: {
          required: false
        }
      });
    }

  } catch (error) {
    console.error("Error creating crawl job:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     CrawlJobRequest:
 *       type: object
 *       required:
 *         - url
 *         - maxPages
 *         - ai
 *         - email
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           description: The URL to crawl
 *           example: "https://example.com"
 *         maxPages:
 *           type: integer
 *           minimum: 1
 *           description: Maximum number of pages to crawl
 *           example: 5
 *         ai:
 *           type: boolean
 *           description: Whether to use AI processing
 *           example: true
 *         email:
 *           type: string
 *           format: email
 *           description: Email address for notifications
 *           example: "test@example.com"
 *         takeScreenshots:
 *           type: boolean
 *           description: Whether to capture screenshots of pages (optional, default true)
 *           example: true
 *           default: true
 *         sampledCrawl:
 *           type: boolean
 *           description: Whether to crawl only 3 pages of each post type for large sites (optional, default false)
 *           example: false
 *           default: false
 *         ignoreUrlParameters:
 *           type: boolean
 *           description: Whether to ignore URL parameters when crawling and storing links (optional, default false)
 *           example: false
 *           default: false
 *         requireEmailVerification:
 *           type: boolean
 *           description: Whether to require email verification before starting the crawl (optional, default true)
 *           example: true
 *           default: true
 *     CrawlJob:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique job identifier
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         url:
 *           type: string
 *           description: The URL being crawled
 *           example: "https://example.com"
 *         maxPages:
 *           type: integer
 *           description: Maximum pages to crawl
 *           example: 5
 *         ai:
 *           type: boolean
 *           description: AI processing enabled
 *           example: true
 *         email:
 *           type: string
 *           description: Notification email
 *           example: "test@example.com"
 *         status:
 *           type: string
 *           description: Job status
 *           example: "pending"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Job creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Job last update timestamp
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *         required:
 *           type: array
 *           items:
 *             type: string
 *           description: List of required fields (for validation errors)
 *         expected:
 *           type: object
 *           description: Expected field types (for type validation errors)
 *     CrawlJobWithPages:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *         maxPages:
 *           type: integer
 *         ai:
 *           type: boolean
 *         email:
 *           type: string
 *         status:
 *           type: string
 *         startedAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 *         errorMessage:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         crawledPages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CrawledPageSummary'
 *         aiReport:
 *           $ref: '#/components/schemas/AIReport'
 *     CrawledPageSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *         title:
 *           type: string
 *         statusCode:
 *           type: integer
 *         responseTime:
 *           type: integer
 *         wordCount:
 *           type: integer
 *         crawledAt:
 *           type: string
 *           format: date-time
 *         readability:
 *           type: string
 *         fleschReadingEaseScore:
 *           type: number
 *     AIReport:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [pending, completed, failed, not_requested]
 *           description: Status of AI report generation
 *           example: "completed"
 *         data:
 *           type: object
 *           description: AI readability report JSON data (structure varies by external service)
 *           example: 
 *             summary:
 *               overallScore: 85
 *               readabilityGrade: "Good"
 *             pages:
 *               - url: "https://example.com"
 *                 score: 90
 *                 suggestions: ["Use shorter sentences", "Break up long paragraphs"]
 *         generatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when AI report was generated
 *         error:
 *           type: string
 *           description: Error message if AI report generation failed
 *     VerificationStatus:
 *       type: object
 *       properties:
 *         requiresVerification:
 *           type: boolean
 *           description: Whether the job requires email verification.
 *         isVerified:
 *           type: boolean
 *           description: Whether the email has been verified.
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the email was verified.
 *         codeSentAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the verification code was sent.
 *         codeExpiresAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the verification code expires.
 *         isCodeExpired:
 *           type: boolean
 *           description: Whether the verification code has expired.
 *         attemptsMade:
 *           type: integer
 *           description: The number of verification attempts made.
 *         attemptsRemaining:
 *           type: integer
 *           description: The number of verification attempts remaining.
 *         canRequestNewCode:
 *           type: boolean
 *           description: Whether a new code can be requested.
 *         jobStatus:
 *           type: string
 *           description: The current status of the job.
 *         email:
 *           type: string
 *           format: email
 *           description: The email address associated with the job.
 */

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Get all crawl jobs
 *     description: Retrieve all crawl jobs with their basic information
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed, waiting_verification]
 *         description: Filter jobs by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of jobs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of jobs to skip
 *     responses:
 *       200:
 *         description: List of crawl jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CrawlJobWithPages'
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 */
router.get("/", authenticateToken, requireUser, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    const where = status ? { status } : {};
    const take = Math.min(parseInt(limit), 100);
    const skip = Math.max(parseInt(offset), 0);

    const [jobs, total] = await Promise.all([
      prisma.crawlJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          internalLinks: {
            select: {
              id: true,
              address: true,
              title: true,
              statusCode: true,
              responseTime: true,
              wordCount: true,
              crawlTimestamp: true
            },
            orderBy: { crawlTimestamp: "asc" }
          }
        }
      }),
      prisma.crawlJob.count({ where })
    ]);

    // Format the response to map internalLinks to crawledPages
    const formattedJobs = jobs.map(job => ({
      ...job,
      crawledPages: job.internalLinks.map(link => ({
        id: link.id,
        url: link.address,
        title: link.title,
        statusCode: link.statusCode,
        responseTime: link.responseTime,
        wordCount: link.wordCount,
        crawledAt: link.crawlTimestamp
      }))
    }));

    // Remove internalLinks from response
    formattedJobs.forEach(job => delete job.internalLinks);

    res.json({
      jobs: formattedJobs,
      total,
      hasMore: skip + take < total
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get a specific crawl job
 *     description: Retrieve detailed information about a specific crawl job including all crawled pages
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Crawl job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CrawlJobWithPages'
 *       404:
 *         description: Job not found
 */
router.get("/:id", authenticateToken, requireUser, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId },
      include: {
        internalLinks: {
          select: {
            id: true,
            address: true,
            title: true,
            statusCode: true,
            responseTime: true,
            wordCount: true,
            crawlTimestamp: true,
            readability: true,
            fleschReadingEaseScore: true
          },
          orderBy: { crawlTimestamp: "asc" }
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Format the response to include AI report information
    const response = {
      ...job,
      crawledPages: job.internalLinks.map(link => ({
        id: link.id,
        url: link.address,
        title: link.title,
        statusCode: link.statusCode,
        responseTime: link.responseTime,
        wordCount: link.wordCount,
        crawledAt: link.crawlTimestamp,
        readability: link.readability,
        fleschReadingEaseScore: link.fleschReadingEaseScore
      })),
      aiReport: {
        status: job.aiReportStatus,
        data: job.aiReportData,
        generatedAt: job.aiReportGeneratedAt,
        error: job.aiReportError
      }
    };

    // Remove internal fields from response
    delete response.internalLinks;
    delete response.aiReportStatus;
    delete response.aiReportData;
    delete response.aiReportGeneratedAt;
    delete response.aiReportError;

    res.json(response);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/pages/{pageId}:
 *   get:
 *     summary: Get detailed page data
 *     description: Retrieve complete information about a specific crawled page
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *       - in: path
 *         name: pageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Page ID
 *     responses:
 *       200:
 *         description: Complete page data
 *       404:
 *         description: Page not found
 */
router.get("/:id/pages/:pageId", authenticateToken, requireUser, async (req, res) => {
  try {
    const jobId = req.params.id;
    const pageId = parseInt(req.params.pageId);
    
    const page = await prisma.internalLink.findFirst({
      where: {
        id: pageId,
        jobId: jobId
      },
      include: {
        incomingLinks: true,
        outgoingLinks: true
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
  } catch (error) {
    console.error("Error fetching page:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/send-email-report:
 *   post:
 *     summary: Send email report for a completed job
 *     description: Manually trigger email report delivery for a completed crawl job (for testing purposes)
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The job ID
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipient:
 *                 type: string
 *                 format: email
 *                 description: Optional recipient email (overrides default BCC)
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email report sent successfully"
 *                 recipient:
 *                   type: string
 *                   example: "test@example.com"
 *       400:
 *         description: Job not found or not completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Email service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:id/send-email-report", authenticateToken, requireUser, async (req, res) => {
  try {
    const jobId = req.params.id;
    const { recipient } = req.body;

    // Check if job exists and is completed
    const job = await prisma.crawlJob.findUnique({
      where: { id: jobId }
    });

    if (!job) {
      return res.status(400).json({ error: "Job not found" });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ 
        error: "Job is not completed", 
        currentStatus: job.status 
      });
    }

    // Load EmailService and send report
    const EmailService = require('../services/emailService');
    const emailService = new EmailService();
    
    try {
      const result = await emailService.sendJobCompletionReport(jobId, recipient);
      
      if (result.success) {
        res.json({
          message: "Email report sent successfully",
          recipient: result.recipient,
          jobId: jobId
        });
      } else {
        res.status(500).json({
          error: "Failed to send email report",
          reason: result.reason || result.error
        });
      }
    } finally {
      await emailService.close();
    }

  } catch (error) {
    console.error("Error sending email report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/verify:
 *   post:
 *     summary: Verify a crawl job with a verification code
 *     description: Submits a 6-digit verification code to verify and start a crawl job.
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the crawl job to verify.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: The 6-digit verification code sent to the user's email.
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully. The crawl job will start shortly.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email verified successfully. Your crawl job will start processing shortly."
 *       400:
 *         description: Bad request, such as an invalid or expired code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Job not found.
 *       500:
 *         description: Internal server error.
 */
router.post("/:id/verify", authenticateToken, requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Verification code is required" });
    }

    const EmailVerificationService = require('../services/emailVerificationService');
    const verificationService = new EmailVerificationService();

    const result = await verificationService.verifyCode(id, code);

    if (result.success) {
      // If verification is successful, the job status is updated to 'pending'.
      // The main crawl processor will pick it up.
      res.status(200).json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }

    await verificationService.close();

  } catch (error) {
    console.error(`Error verifying job ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to verify job" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/resend-verification:
 *   post:
 *     summary: Resend verification code
 *     description: Requests a new verification code to be sent to the user's email. This is rate-limited.
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the crawl job.
 *     responses:
 *       200:
 *         description: Verification email sent successfully.
 *       400:
 *         description: Bad request, such as if the email is already verified or rate limit is exceeded.
 *       404:
 *         description: Job not found.
 *       500:
 *         description: Internal server error.
 */
router.post("/:id/resend-verification", authenticateToken, requireUser, async (req, res) => {
  try {
    const { id } = req.params;

    const EmailVerificationService = require('../services/emailVerificationService');
    const verificationService = new EmailVerificationService();

    const result = await verificationService.resendVerificationCode(id);

    if (result.success) {
      res.status(200).json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }

    await verificationService.close();

  } catch (error) {
    console.error(`Error resending verification for job ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to resend verification" });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/verification-status:
 *   get:
 *     summary: Get verification status
 *     description: Retrieves the current email verification status for a specific crawl job.
 *     tags:
 *       - Jobs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the crawl job.
 *     responses:
 *       200:
 *         description: The verification status of the job.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationStatus'
 *       404:
 *         description: Job not found.
 *       500:
 *         description: Internal server error.
 */
router.get("/:id/verification-status", authenticateToken, requireUser, async (req, res) => {
  try {
    const { id } = req.params;

    const EmailVerificationService = require('../services/emailVerificationService');
    const verificationService = new EmailVerificationService();

    const result = await verificationService.getVerificationStatus(id);

    if (result.success) {
      res.status(200).json(result.status);
    } else {
      res.status(404).json({ error: result.error });
    }

    await verificationService.close();

  } catch (error) {
    console.error(`Error getting verification status for job ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to get verification status" });
  }
});

module.exports = router;
