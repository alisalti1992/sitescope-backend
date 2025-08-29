const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new crawl job
 *     description: Creates a new web crawling job with the specified parameters and saves it to the database
 *     tags:
 *       - Jobs
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
router.post("/", async (req, res) => {
  try {
    const { url, maxPages, ai, email, takeScreenshots = true, sampledCrawl = false, ignoreUrlParameters = false } = req.body;

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
        ignoreUrlParameters
      }
    });

    res.status(201).json({
      message: "Crawl job created successfully",
      job: crawlJob
    });

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
 *     CrawlJob:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique job identifier
 *           example: 1
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
 *           type: integer
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
 *           type: integer
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
 */

/**
 * @swagger
 * /jobs:
 *   get:
 *     summary: Get all crawl jobs
 *     description: Retrieve all crawl jobs with their basic information
 *     tags:
 *       - Jobs
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed]
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
router.get("/", async (req, res) => {
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
 * /jobs/{id}:
 *   get:
 *     summary: Get a specific crawl job
 *     description: Retrieve detailed information about a specific crawl job including all crawled pages
 *     tags:
 *       - Jobs
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
router.get("/:id", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    
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
 * /jobs/{id}/pages/{pageId}:
 *   get:
 *     summary: Get detailed page data
 *     description: Retrieve complete information about a specific crawled page
 *     tags:
 *       - Jobs
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
router.get("/:id/pages/:pageId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
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
 * /jobs/{id}/send-email-report:
 *   post:
 *     summary: Send email report for a completed job
 *     description: Manually trigger email report delivery for a completed crawl job (for testing purposes)
 *     tags:
 *       - Jobs
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
router.post("/:id/send-email-report", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
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

module.exports = router;