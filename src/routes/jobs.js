const express = require("express");
const { PrismaClient } = require("../generated/prisma");

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
    const { url, maxPages, ai, email } = req.body;

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
          email: "string"
        }
      });
    }

    // Create crawl job in database
    const crawlJob = await prisma.crawlJob.create({
      data: {
        url,
        maxPages,
        ai,
        email
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
          crawledPages: {
            select: {
              id: true,
              url: true,
              title: true,
              statusCode: true,
              responseTime: true,
              wordCount: true,
              crawledAt: true
            }
          }
        }
      }),
      prisma.crawlJob.count({ where })
    ]);

    res.json({
      jobs,
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
        crawledPages: {
          orderBy: { crawledAt: "asc" }
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(job);
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
    
    const page = await prisma.crawledPage.findFirst({
      where: {
        id: pageId,
        jobId: jobId
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

module.exports = router;