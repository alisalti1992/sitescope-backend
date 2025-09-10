const { PuppeteerCrawler, Configuration } = require("crawlee");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");
const RobotsCrawler = require("./robotsCrawler");
const SitemapCrawler = require("./sitemapCrawler");
Configuration.set('systemInfoV2', true);

/**
 * SEO Crawl Processor
 * 
 * Handles comprehensive web crawling for SEO analysis including:
 * - Internal link discovery and analysis
 * - Page content extraction and SEO metrics
 * - Link relationship mapping
 * - Performance and accessibility analysis
 */
class CrawlProcessor {
  constructor() {
    this.prisma = new PrismaClient();
    this.isProcessing = false;
    this.processingInterval = null;
    this.PROCESSING_INTERVAL = 10000; // 10 seconds
  }

  // ==================== LIFECYCLE MANAGEMENT ====================

  /**
   * Start the crawl processor
   * Begins monitoring for pending jobs every 10 seconds
   */
  async start() {
    console.log('🔄 Starting crawl processor...');
    this.processingInterval = setInterval(() => {
      this.processPendingJobs();
    }, this.PROCESSING_INTERVAL);
    
    // Process immediately on start
    this.processPendingJobs();
  }

  /**
   * Stop the crawl processor and cleanup resources
   */
  async stop() {
    console.log('⏹️ Stopping crawl processor...');
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    await this.prisma.$disconnect();
  }

  // ==================== JOB PROCESSING ====================

  /**
   * Process all pending crawl jobs
   * Only processes one job at a time to prevent resource conflicts
   */
  async processPendingJobs() {
    if (this.isProcessing) {
      return; // Prevent concurrent processing
    }

    try {
      this.isProcessing = true;
      const pendingJobs = await this.findPendingJobs();

      for (const job of pendingJobs) {
        console.log(`🚀 Processing job ${job.id}: ${job.url}`);
        await this.processJob(job);
      }
    } catch (error) {
      console.error('❌ Error processing jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Find jobs that need processing
   * @returns {Promise<Array>} List of pending jobs
   */
  async findPendingJobs() {
    return await this.executeWithRetry(
      () => this.prisma.crawlJob.findMany({
        where: {
          status: { in: ["pending", "running"] },
          canContinue: true
        },
        orderBy: { createdAt: "asc" },
        take: 1 // Process one job at a time
      }),
      'find pending jobs'
    );
  }

  /**
   * Process a single crawl job
   * @param {Object} job - The job to process
   */
  async processJob(job) {
    try {
      // Mark job as running
      await this.updateJobStatus(job.id, 'running', {
        startedAt: job.startedAt || new Date(),
        pagesRemaining: job.maxPages - job.pagesCrawled
      });

      // Always crawl robots.txt and sitemaps first
      console.log(`🤖 Processing robots.txt and sitemaps for: ${job.url}`);
      const { robotsData, sitemaps, sitemapUrls } = await this.processRobotsAndSitemaps(job);

      // Setup crawler and start crawling
      const crawledUrls = new Set();
      
      // Track the canonical domain after redirect resolution
      const domainTracker = { 
        originalDomain: null,
        canonicalDomain: null,
        domains: new Set()
      };
      
      const crawler = await this.setupCrawler(job, crawledUrls, domainTracker);
      
      // Get initial URLs to crawl
      const initialUrls = [{ url: this.normalizeUrl(job.url, job.ignoreUrlParameters) }];
      
      // Add sitemap URLs (now always included)
      if (sitemapUrls.length > 0) {
        console.log(`🗺️ Adding ${sitemapUrls.length} URLs from sitemaps`);
        initialUrls.push(...sitemapUrls.map(url => ({ url })));
      }
      
      console.log(`🕷️ Starting crawl for: ${job.url}`);
      await crawler.run(initialUrls);
      
      // Post-processing
      await this.finalizeCrawl(job.id);
      
      console.log(`✅ Completed job ${job.id}`);

    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      await this.updateJobStatus(job.id, 'failed', {
        completedAt: new Date(),
        errorMessage: error.message
      });
    }
  }

  // ==================== CRAWLER SETUP ====================

  /**
   * Setup and configure the Puppeteer crawler
   * @param {Object} job - The crawl job
   * @param {Set} crawledUrls - Set to track crawled URLs
   * @param {Object} domainTracker - Object to track domain redirects
   * @returns {PuppeteerCrawler} Configured crawler instance
   */
  async setupCrawler(job, crawledUrls, domainTracker) {
    const { RequestQueue } = require("crawlee");
    
    // Create a unique request queue for this job
    const uniqueQueueId = `job-${job.id}-${Date.now()}`;
    const requestQueue = await RequestQueue.open(uniqueQueueId);
    
    // Initialize post type counters for sampled crawling
    const postTypeCounters = new Map();
    
    return new PuppeteerCrawler({
      maxRequestsPerCrawl: job.maxPages,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 30,
      requestQueue, // Use the unique request queue
      requestHandler: async ({ request, page, response, enqueueLinks, log }) => {
        await this.handlePageCrawl(job, request, page, response, enqueueLinks, log, crawledUrls, postTypeCounters, domainTracker);
      },
      failedRequestHandler: async ({ request, error, log }) => {
        log.error(`Failed to crawl ${request.url}: ${error.message}`);
      }
    });
  }

  /**
   * Handle crawling of a single page
   */
  async handlePageCrawl(job, request, page, response, enqueueLinks, log, crawledUrls, postTypeCounters = new Map(), domainTracker = null) {
    const startTime = Date.now();
    const normalizedUrl = this.normalizeUrl(request.loadedUrl || request.url, job.ignoreUrlParameters);

    try {
      // Track domain redirects on first page
      if (domainTracker && !domainTracker.originalDomain) {
        const originalUrlObj = new URL(job.url);
        const currentUrlObj = new URL(request.loadedUrl || request.url);
        
        domainTracker.originalDomain = originalUrlObj.hostname;
        domainTracker.canonicalDomain = currentUrlObj.hostname;
        domainTracker.domains.add(originalUrlObj.hostname);
        domainTracker.domains.add(currentUrlObj.hostname);
        
        if (originalUrlObj.hostname !== currentUrlObj.hostname) {
          log.info(`🔄 Domain redirect detected: ${originalUrlObj.hostname} → ${currentUrlObj.hostname}`);
        }
      }

      // Skip if already processed or reached limit
      if (await this.shouldSkipPage(normalizedUrl, crawledUrls, job, log)) {
        return;
      }

      // For sampled crawl, check if we should skip based on post type limits
      if (job.sampledCrawl && await this.shouldSkipForSampledCrawl(normalizedUrl, postTypeCounters, log)) {
        return;
      }

      crawledUrls.add(normalizedUrl);

      // Wait for page to load
      await this.waitForPageLoad(page);

      // Extract all page data
      const pageData = await this.extractAllPageData(page, normalizedUrl, response, startTime, job);

      // For sampled crawl, increment the post type counter only for second-level and deeper pages
      if (job.sampledCrawl) {
        const urlLevel = this.getUrlLevel(normalizedUrl);
        const postType = this.detectPostType(normalizedUrl, pageData);
        
        if (urlLevel > 1) {
          // Only count second-level and deeper pages
          const currentCount = postTypeCounters.get(postType) || 0;
          postTypeCounters.set(postType, currentCount + 1);
          log.info(`📊 Post type '${postType}': ${currentCount + 1}/3 pages crawled (level ${urlLevel})`);
        } else {
          // First-level pages are always allowed
          log.info(`📊 First-level page allowed: ${normalizedUrl} (level ${urlLevel})`);
        }
      }

      // Save page to database
      const internalLink = await this.savePageData(job.id, normalizedUrl, pageData, response, startTime);

      // Process links and enqueue new ones (with sampling logic if enabled)
      await this.processPageLinks(job, internalLink, page, normalizedUrl, enqueueLinks, crawledUrls, postTypeCounters, domainTracker);

      // Update job progress
      await this.updateJobProgress(job.id, normalizedUrl);

      log.info(`✅ Crawled: ${normalizedUrl}`);

    } catch (error) {
      log.error(`❌ Error crawling ${normalizedUrl}:`, error.message);
    }
  }

  // ==================== PAGE DATA EXTRACTION ====================

  /**
   * Extract all data from a page
   */
  async extractAllPageData(page, url, response, startTime, job) {
    // Extract basic page content
    const basicData = await this.extractBasicPageData(page, url);
    
    // Calculate metrics
    const metrics = await this.calculatePageMetrics(basicData, response, startTime);
    
    // Take screenshot if enabled
    const screenshotUrl = job.takeScreenshots 
      ? await this.takeScreenshot(page, job.id, url) 
      : null;

    return {
      ...basicData,
      ...metrics,
      screenshotUrl
    };
  }

  /**
   * Extract basic content and structure from page
   */
  async extractBasicPageData(page, url) {
    return await page.evaluate((currentUrl) => {
      const result = {
        url: currentUrl,
        title: document.title || null,
        htmlContent: document.documentElement.outerHTML,
        textContent: document.body ? document.body.innerText : null,
        h1Tags: [],
        h2Tags: [],
        h3Tags: []
      };

      // Extract meta tags
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      // Basic SEO meta tags
      result.metaDescription = getMetaContent('description');
      result.metaKeywords = getMetaContent('keywords');
      result.metaRobots = getMetaContent('robots');
      result.language = document.documentElement.getAttribute('lang');

      // Link elements
      const getLink = (rel, attr = 'href') => {
        const link = document.querySelector(`link[rel="${rel}"]`);
        return link ? link.getAttribute(attr) : null;
      };

      result.canonicalUrl = getLink('canonical');
      result.relNext = getLink('next');
      result.relPrev = getLink('prev');
      result.amphtmlLinkElement = getLink('amphtml');
      result.mobileAlternateLink = getLink('alternate') || null;

      // Extract headings
      ['h1', 'h2', 'h3'].forEach(tag => {
        const headings = Array.from(document.querySelectorAll(tag));
        result[`${tag}Tags`] = headings
          .map(h => h.textContent.trim())
          .filter(text => text.length > 0);
      });

      // Count elements
      result.linkCount = document.querySelectorAll('a[href]').length;
      result.imageCount = document.querySelectorAll('img').length;

      return result;
    }, url);
  }

  /**
   * Calculate page metrics and analysis
   */
  async calculatePageMetrics(data, response, startTime) {
    const metrics = {
      // Size metrics
      sizeBytes: Buffer.byteLength(data.htmlContent || '', 'utf8'),
      responseTime: Date.now() - startTime
    };

    metrics.transferredBytes = metrics.sizeBytes;
    metrics.totalTransferredBytes = metrics.sizeBytes;

    // Text analysis
    if (data.textContent) {
      const textAnalysis = this.analyzeTextContent(data.textContent);
      Object.assign(metrics, textAnalysis);
      
      // Calculate text to HTML ratio
      metrics.textRatio = data.htmlContent.length > 0 
        ? (data.textContent.length / data.htmlContent.length) * 100 
        : 0;
    }

    // Performance ratings
    metrics.co2Mg = this.calculateCO2(metrics.transferredBytes);
    metrics.carbonRating = this.getCarbonRating(metrics.transferredBytes);

    // HTTP data
    if (response) {
      const headers = response.headers();
      metrics.httpVersion = '1.1';
      metrics.lastModified = headers['last-modified'] ? new Date(headers['last-modified']) : null;
      metrics.cookies = headers['set-cookie'] || null;
    }

    return metrics;
  }

  /**
   * Analyze text content for readability metrics
   */
  analyzeTextContent(textContent) {
    const words = textContent.split(/\s+/).filter(word => word.length > 0);
    const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);

    const analysis = {
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : 0
    };

    // Calculate Flesch Reading Ease Score (simplified)
    if (analysis.sentenceCount > 0 && analysis.wordCount > 0) {
      const syllableCount = words.reduce((count, word) => {
        return count + Math.max(1, word.replace(/[^aeiouAEIOU]/g, '').length);
      }, 0);
      const avgSyllablesPerWord = syllableCount / analysis.wordCount;
      
      analysis.fleschReadingEaseScore = 206.835 - 
        (1.015 * analysis.avgWordsPerSentence) - 
        (84.6 * avgSyllablesPerWord);
    } else {
      analysis.fleschReadingEaseScore = 0;
    }

    return analysis;
  }

  // ==================== LINK PROCESSING ====================

  /**
   * Process all links found on a page
   */
  async processPageLinks(job, internalLinkRecord, page, sourceUrl, enqueueLinks, crawledUrls, postTypeCounters = new Map(), domainTracker = null) {
    const links = await this.extractAllLinks(page, sourceUrl);
    
    // Save link relationships
    await this.saveLinkRelationships(job, internalLinkRecord, links);
    
    // Enqueue internal links for further crawling (with sampling logic if enabled)
    await this.enqueueInternalLinks(links.internal, enqueueLinks, crawledUrls, job, postTypeCounters, domainTracker);
  }

  /**
   * Extract all links from page
   */
  async extractAllLinks(page, sourceUrl) {
    return await page.evaluate((source) => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const internal = [];
      const external = [];

      links.forEach((link, index) => {
        const linkData = {
          href: link.href,
          anchorText: link.textContent.trim(),
          altText: link.querySelector('img')?.alt || null,
          rel: link.getAttribute('rel'),
          target: link.getAttribute('target'),
          follow: !link.getAttribute('rel')?.includes('nofollow'),
          position: index + 1,
          origin: 'html'
        };

        try {
          const linkUrl = new URL(linkData.href);
          const sourceUrlObj = new URL(source);
          
          if (linkUrl.hostname === sourceUrlObj.hostname) {
            internal.push(linkData);
          } else {
            external.push(linkData);
          }
        } catch (error) {
          // Skip invalid URLs
        }
      });

      return { internal, external };
    }, sourceUrl);
  }

  /**
   * Save link relationships to database
   */
  async saveLinkRelationships(job, internalLinkRecord, links) {
    // Process internal links
    for (const link of links.internal) {
      await this.saveInlink('internal', job, internalLinkRecord, link);
    }

    // Process external links
    for (const link of links.external) {
      const externalLink = await this.findOrCreateExternalLink(job.id, link.href);
      await this.saveInlink('external', job, internalLinkRecord, link, externalLink);
    }
  }

  /**
   * Save individual inlink record
   */
  async saveInlink(type, job, fromLink, link, toExternalLink = null) {
    const linkData = {
      jobId: job.id,
      type,
      fromAddress: fromLink.address,
      toAddress: type === 'internal' ? this.normalizeUrl(link.href, job.ignoreUrlParameters) : link.href,
      anchorText: link.anchorText,
      altText: link.altText,
      follow: link.follow,
      target: link.target,
      rel: link.rel,
      linkPosition: link.position,
      linkOrigin: link.origin,
      fromInternalLinkId: fromLink.id
    };

    if (toExternalLink) {
      linkData.toExternalLinkId = toExternalLink.id;
    }

    await this.prisma.inlink.create({ data: linkData });
  }

  // ==================== DATABASE OPERATIONS ====================

  /**
   * Save page data to database
   */
  async savePageData(jobId, url, pageData, response, startTime) {
    const crawlDepth = this.calculateCrawlDepth(url, pageData.startUrl);
    const folderDepth = this.calculateFolderDepth(url);

    return await this.prisma.internalLink.create({
      data: {
        jobId,
        address: url,
        contentType: response?.headers()?.['content-type'] || 'text/html',
        statusCode: response?.status() || 200,
        status: this.getStatusText(response?.status() || 200),
        indexability: this.determineIndexability(pageData),
        indexabilityStatus: this.getIndexabilityStatus(pageData),
        
        // Content Data
        title: pageData.title,
        metaDescription: pageData.metaDescription,
        metaKeywords: pageData.metaKeywords,
        h1: pageData.h1Tags?.[0] || null,
        metaRobots: pageData.metaRobots,
        canonicalLinkElement: pageData.canonicalUrl,
        relNext: pageData.relNext,
        relPrev: pageData.relPrev,
        amphtmlLinkElement: pageData.amphtmlLinkElement,
        
        // Size & Performance
        sizeBytes: pageData.sizeBytes,
        transferredBytes: pageData.transferredBytes,
        totalTransferredBytes: pageData.totalTransferredBytes,
        co2Mg: pageData.co2Mg,
        carbonRating: pageData.carbonRating,
        responseTime: pageData.responseTime,
        
        // Content Analysis
        wordCount: pageData.wordCount,
        sentenceCount: pageData.sentenceCount,
        avgWordsPerSentence: pageData.avgWordsPerSentence,
        fleschReadingEaseScore: pageData.fleschReadingEaseScore,
        readability: this.getReadabilityRating(pageData.fleschReadingEaseScore),
        textRatio: pageData.textRatio,
        
        // Structure
        crawlDepth,
        folderDepth,
        linkScore: 0, // Calculated after all links processed
        
        // Technical
        lastModified: pageData.lastModified,
        language: pageData.language,
        httpVersion: pageData.httpVersion,
        mobileAlternateLink: pageData.mobileAlternateLink,
        urlEncodedAddress: encodeURIComponent(url),
        cookies: pageData.cookies,
        
        // Raw Data
        htmlContent: pageData.htmlContent,
        screenshotUrl: pageData.screenshotUrl,
        
        crawlTimestamp: new Date()
      }
    });
  }

  /**
   * Update job status and metadata
   */
  async updateJobStatus(jobId, status, additionalData = {}) {
    await this.prisma.crawlJob.update({
      where: { id: jobId },
      data: { status, ...additionalData }
    });
  }

  /**
   * Update job progress counters
   */
  async updateJobProgress(jobId, lastCrawledUrl) {
    const count = await this.prisma.internalLink.count({ where: { jobId } });
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    
    await this.prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        pagesCrawled: count,
        pagesRemaining: job.maxPages - count,
        lastCrawledUrl,
        totalUniquePagesFound: count
      }
    });
  }

  /**
   * Find or create external link record
   */
  async findOrCreateExternalLink(jobId, address) {
    let externalLink = await this.prisma.externalLink.findFirst({
      where: { jobId, address }
    });

    if (!externalLink) {
      externalLink = await this.prisma.externalLink.create({
        data: { jobId, address, status: 'Not Checked' }
      });
    }

    return externalLink;
  }

  // ==================== POST-PROCESSING ====================

  /**
   * Finalize crawl and calculate relationships
   */
  async finalizeCrawl(jobId) {
    console.log(`📊 Calculating link scores for job ${jobId}...`);
    await this.calculateLinkScoresAndRelationships(jobId);

    const finalCount = await this.prisma.internalLink.count({ where: { jobId } });

    await this.updateJobStatus(jobId, 'completed', {
      completedAt: new Date(),
      pagesCrawled: finalCount,
      pagesRemaining: 0
    });

    // Process AI report if requested
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (job.ai) {
      const AIWebhookService = require('./aiWebhookService');
      const aiService = new AIWebhookService();
      await aiService.processAIReport(jobId);
    }

    // Send email report if enabled
    await this.sendEmailReport(jobId);
  }

  /**
   * Send email report for completed crawl job
   * @param {number} jobId - The completed job ID
   */
  async sendEmailReport(jobId) {
    try {
      const EmailService = require('./emailService');
      const emailService = new EmailService();
      
      // Send email report asynchronously to avoid blocking crawl completion
      setImmediate(async () => {
        try {
          console.log(`📧 Sending email report for job ${jobId}...`);
          const result = await emailService.sendJobCompletionReport(jobId);
          
          if (result.success) {
            console.log(`✅ Email report sent successfully for job ${jobId} to ${result.recipient}`);
          } else {
            console.log(`⚠️ Email report not sent for job ${jobId}: ${result.reason || result.error}`);
          }
        } catch (error) {
          console.error(`❌ Email report delivery failed for job ${jobId}:`, error.message);
        } finally {
          await emailService.close();
        }
      });
      
    } catch (error) {
      console.error(`❌ Failed to initialize email service for job ${jobId}:`, error.message);
    }
  }

  /**
   * Calculate link scores and relationships for all pages
   */
  async calculateLinkScoresAndRelationships(jobId) {
    const internalLinks = await this.prisma.internalLink.findMany({
      where: { jobId },
      include: { incomingLinks: true, outgoingLinks: true }
    });

    // Update internal link scores
    for (const link of internalLinks) {
      const linkMetrics = this.calculateLinkMetrics(link, internalLinks.length);
      
      await this.prisma.internalLink.update({
        where: { id: link.id },
        data: linkMetrics
      });
    }

    // Update external link counts
    await this.updateExternalLinkCounts(jobId);
  }

  /**
   * Calculate link metrics for a single page
   */
  calculateLinkMetrics(link, totalPages) {
    const inlinks = link.incomingLinks.length;
    const uniqueInlinks = new Set(link.incomingLinks.map(l => l.fromAddress)).size;
    const outlinks = link.outgoingLinks.length;
    const uniqueOutlinks = new Set(link.outgoingLinks.map(l => l.toAddress)).size;
    const externalOutlinks = link.outgoingLinks.filter(l => l.type === 'external').length;
    const uniqueExternalOutlinks = new Set(
      link.outgoingLinks.filter(l => l.type === 'external').map(l => l.toAddress)
    ).size;

    return {
      inlinks,
      uniqueInlinks,
      outlinks,
      uniqueOutlinks,
      externalOutlinks,
      uniqueExternalOutlinks,
      linkScore: this.calculateLinkScore(inlinks, outlinks),
      percentOfTotal: totalPages > 0 ? (inlinks / totalPages) * 100 : 0
    };
  }

  /**
   * Update external link inlink counts
   */
  async updateExternalLinkCounts(jobId) {
    const externalLinks = await this.prisma.externalLink.findMany({
      where: { jobId },
      include: { incomingLinks: true }
    });

    for (const link of externalLinks) {
      await this.prisma.externalLink.update({
        where: { id: link.id },
        data: { inlinks: link.incomingLinks.length }
      });
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if a page should be skipped
   */
  async shouldSkipPage(normalizedUrl, crawledUrls, job, log) {
    // Already processed
    if (crawledUrls.has(normalizedUrl)) {
      log.info(`⏭️ Skipping duplicate: ${normalizedUrl}`);
      return true;
    }

    // Reached page limit
    const currentCount = await this.prisma.internalLink.count({ where: { jobId: job.id } });
    if (currentCount >= job.maxPages) {
      log.info(`⏹️ Reached max pages limit: ${job.maxPages}`);
      return true;
    }

    return false;
  }

  /**
   * Check if a page should be skipped for sampled crawl based on post type limits
   */
  async shouldSkipForSampledCrawl(url, postTypeCounters, log) {
    const urlLevel = this.getUrlLevel(url);
    
    // Allow all first-level pages (like /about, /privacy-policy, etc.)
    if (urlLevel === 1) {
      return false;
    }
    
    // For second-level and deeper pages, apply the 3-page limit per post type
    const postType = this.detectPostType(url);
    const currentCount = postTypeCounters.get(postType) || 0;
    
    if (currentCount >= 3) {
      log.info(`⏭️ Skipping ${url} - already crawled 3 pages of post type '${postType}' (level ${urlLevel})`);
      return true;
    }
    
    return false;
  }

  /**
   * Get the URL level (depth) from the root domain
   * @param {string} url - The URL to analyze
   * @returns {number} The level of the URL (1 for first-level like /about, 2+ for deeper levels)
   */
  getUrlLevel(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Root path is level 0
      if (pathname === '/' || pathname === '') {
        return 0;
      }
      
      // Count path segments (excluding empty segments)
      const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
      return pathSegments.length;
    } catch (error) {
      return 1; // Default to level 1 if URL parsing fails
    }
  }

  /**
   * Detect the post type based on URL patterns and page content
   * @param {string} url - The URL to analyze
   * @param {Object} pageData - Optional page data for content analysis
   * @returns {string} The detected post type
   */
  detectPostType(url, pageData = null) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      // Common blog post patterns
      if (pathname.match(/\/(blog|post|article|news)\/.*\d{4}/)) return 'blog-post';
      if (pathname.match(/\/\d{4}\/\d{2}\/\d{2}\//)) return 'blog-post';
      if (pathname.match(/\/(blog|post|article|news)\//)) return 'blog-post';
      
      // E-commerce product patterns
      if (pathname.match(/\/(product|item|shop)\//)) return 'product';
      if (pathname.match(/\/p\/|\/products\//)) return 'product';
      
      // Category/archive pages
      if (pathname.match(/\/(category|tag|archive|topics)\//)) return 'category';
      if (pathname.match(/\/cat\/|\/tags\//)) return 'category';
      
      // Landing/service pages
      if (pathname.match(/\/(services|solutions|features)\//)) return 'service';
      
      // About/company pages
      if (pathname.match(/\/(about|company|team|contact)\//)) return 'about';
      
      // Documentation/help pages
      if (pathname.match(/\/(docs|help|support|faq|guide)\//)) return 'documentation';
      
      // Homepage and main sections
      if (pathname === '/' || pathname === '') return 'homepage';
      
      // Use page title/content if available for better detection
      if (pageData && pageData.title) {
        const title = pageData.title.toLowerCase();
        if (title.includes('blog') || title.includes('post') || title.includes('article')) return 'blog-post';
        if (title.includes('product') || title.includes('buy') || title.includes('price')) return 'product';
        if (title.includes('category') || title.includes('archive')) return 'category';
      }
      
      // Default fallback based on path depth
      const pathSegments = pathname.split('/').filter(s => s.length > 0);
      if (pathSegments.length === 0) return 'homepage';
      if (pathSegments.length === 1) return 'section';
      if (pathSegments.length >= 2) return 'content';
      
      return 'other';
    } catch (error) {
      return 'other';
    }
  }

  /**
   * Wait for page to load completely
   */
  async waitForPageLoad(page) {
    try {
      await page.waitForSelector('body', { timeout: 20000 });
    } catch (timeoutError) {
      // Continue even if selector not found
    }
  }

  /**
   * Enqueue internal links for crawling
   */
  async enqueueInternalLinks(internalLinks, enqueueLinks, crawledUrls, job, postTypeCounters = new Map(), domainTracker = null) {
    let urls = internalLinks
      .map(link => this.normalizeUrl(link.href, job.ignoreUrlParameters))
      .filter(url => !crawledUrls.has(url) && this.isValidInternalUrl(url, job.url, domainTracker));
    
    // For sampled crawl, filter out URLs where post type limit is already reached
    if (job.sampledCrawl) {
      urls = urls.filter(url => {
        const urlLevel = this.getUrlLevel(url);
        
        // Allow all first-level pages
        if (urlLevel === 1) {
          return true;
        }
        
        // For second-level and deeper pages, check post type limits
        const postType = this.detectPostType(url);
        const currentCount = postTypeCounters.get(postType) || 0;
        return currentCount < 3; // Only enqueue if we haven't reached 3 pages for this post type
      });
    }
    
    if (urls.length > 0) {
      try {
        await enqueueLinks({ urls });
      } catch (error) {
        console.error(`Error enqueuing links: ${error.message}`);
      }
    }
  }

  /**
   * Normalize URL for consistent comparison
   * @param {string} url - The URL to normalize
   * @param {boolean} ignoreUrlParameters - Whether to strip query parameters
   */
  normalizeUrl(url, ignoreUrlParameters = false) {
    try {
      const urlObj = new URL(url);
      urlObj.hash = ''; // Remove fragments
      
      // Remove query parameters if ignoreUrlParameters is true
      if (ignoreUrlParameters) {
        urlObj.search = '';
      }
      
      // Remove trailing slash except for root
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  /**
   * Check if URL is valid for internal crawling with redirect-aware domain matching
   * @param {string} url - The URL to validate
   * @param {string} jobUrl - The original job URL
   * @param {Object} domainTracker - Domain tracker containing redirect information
   * @returns {boolean} True if the URL is valid for internal crawling
   */
  isValidInternalUrl(url, jobUrl, domainTracker = null) {
    try {
      const urlObj = new URL(url);
      const jobUrlObj = new URL(jobUrl);
      
      // Check if hostname matches using redirect-aware logic
      let isValidHostname = false;
      
      if (domainTracker && domainTracker.domains.size > 0) {
        // If we have redirect information, check against all known domains
        isValidHostname = domainTracker.domains.has(urlObj.hostname);
      } else {
        // Fallback to direct hostname comparison
        isValidHostname = urlObj.hostname === jobUrlObj.hostname;
      }
      
      // Enhanced domain matching for common www/non-www scenarios
      if (!isValidHostname) {
        // Check for www variations
        const urlHostnameWithoutWww = urlObj.hostname.replace(/^www\./, '');
        const jobHostnameWithoutWww = jobUrlObj.hostname.replace(/^www\./, '');
        
        if (urlHostnameWithoutWww === jobHostnameWithoutWww) {
          isValidHostname = true;
          
          // Add both variations to domain tracker if available
          if (domainTracker) {
            domainTracker.domains.add(urlObj.hostname);
            domainTracker.domains.add(jobUrlObj.hostname);
          }
        }
      }
      
      if (!isValidHostname) return false;
      
      // Skip files and non-HTTP protocols
      if (url.match(/\.(pdf|jpg|jpeg|png|gif|css|js|ico|svg|woff|woff2|ttf|eot|zip|rar|exe|dmg)$/i)) return false;
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return false;
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Take screenshot of page
   */
  async takeScreenshot(page, jobId, url) {
    try {
      const screenshotsDir = path.join(process.cwd(), 'storage', 'screenshots', jobId.toString());
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const urlObj = new URL(url);
      const filename = `${urlObj.hostname}_${urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotsDir, filename);

      await page.screenshot({ path: screenshotPath, fullPage: true });
      return `/screenshots/${jobId}/${filename}`;
      
    } catch (error) {
      console.error('📸 Screenshot error:', error);
      return null;
    }
  }

  // ==================== ROBOTS.TXT AND SITEMAP PROCESSING ====================

  /**
   * Process robots.txt and sitemaps for a crawl job
   * @param {Object} job - The crawl job
   * @returns {Promise<Object>} Object containing robots data, sitemaps, and sitemap URLs
   */
  async processRobotsAndSitemaps(job) {
    const robotsCrawler = new RobotsCrawler();
    const sitemapCrawler = new SitemapCrawler();

    try {
      // 1. Fetch and parse robots.txt
      console.log(`🤖 Fetching robots.txt for: ${job.url}`);
      const robotsData = await robotsCrawler.fetchRobotsTxt(job.url);
      
      // Save robots.txt data to job record
      await this.saveRobotsData(job.id, robotsData);

      // 2. Discover and crawl all sitemaps
      console.log(`🗺️ Discovering sitemaps for: ${job.url}`);
      sitemapCrawler.reset(); // Clear any previous state
      const sitemaps = await sitemapCrawler.discoverAndCrawlSitemaps(job.url, robotsData.sitemapUrls || []);
      
      // Save sitemaps to database
      await this.saveSitemapsData(job.id, sitemaps);

      // 3. Extract URLs from sitemaps for crawling
      const sitemapUrls = sitemapCrawler.extractUrlsForCrawling(sitemaps, job.url);

      console.log(`✅ Processed ${sitemaps.length} sitemap(s) with ${sitemapUrls.length} URLs for crawling`);

      return {
        robotsData,
        sitemaps,
        sitemapUrls
      };

    } catch (error) {
      console.error(`❌ Error processing robots.txt and sitemaps:`, error.message);
      return {
        robotsData: null,
        sitemaps: [],
        sitemapUrls: []
      };
    }
  }

  /**
   * Save robots.txt data to job record
   * @param {number} jobId - The job ID
   * @param {Object} robotsData - Parsed robots.txt data
   */
  async saveRobotsData(jobId, robotsData) {
    try {
      await this.prisma.crawlJob.update({
        where: { id: jobId },
        data: {
          robotsTxtUrl: robotsData.url,
          robotsTxtContent: robotsData.content,
          robotsTxtStatusCode: robotsData.statusCode,
          robotsTxtResponseTime: robotsData.responseTime,
          robotsTxtFetchedAt: new Date()
        }
      });

      if (robotsData.content) {
        console.log(`✅ Saved robots.txt data for job ${jobId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to save robots.txt data for job ${jobId}:`, error.message);
    }
  }

  /**
   * Save sitemaps data to database
   * @param {number} jobId - The job ID
   * @param {Array} sitemaps - Array of sitemap data objects
   */
  async saveSitemapsData(jobId, sitemaps) {
    try {
      for (const sitemap of sitemaps) {
        // Skip saving if this sitemap already failed to load
        if (!sitemap.content) continue;

        await this.prisma.sitemap.create({
          data: {
            jobId,
            url: sitemap.url,
            parentSitemapId: sitemap.parentSitemapId,
            content: sitemap.content,
            statusCode: sitemap.statusCode,
            responseTime: sitemap.responseTime,
            urlCount: sitemap.urlCount,
            urls: sitemap.urls,
            lastMod: sitemap.lastMod,
            changeFreq: sitemap.changeFreq,
            priority: sitemap.priority,
            discoveredFrom: sitemap.discoveredFrom
          }
        });
      }

      console.log(`✅ Saved ${sitemaps.filter(s => s.content).length} sitemap(s) to database for job ${jobId}`);
    } catch (error) {
      console.error(`❌ Failed to save sitemaps data for job ${jobId}:`, error.message);
    }
  }

  // ==================== CALCULATION HELPERS ====================

  calculateCrawlDepth(url, startUrl) {
    try {
      if (url === startUrl) return 0;
      const urlPath = new URL(url).pathname.split('/').filter(s => s.length > 0);
      const startPath = new URL(startUrl).pathname.split('/').filter(s => s.length > 0);
      return Math.max(0, urlPath.length - startPath.length);
    } catch (error) {
      return 0;
    }
  }

  calculateFolderDepth(url) {
    try {
      const pathSegments = new URL(url).pathname.split('/').filter(s => s.length > 0);
      return pathSegments.length;
    } catch (error) {
      return 0;
    }
  }

  calculateLinkScore(inlinks, outlinks) {
    return Math.log(inlinks + 1) * 0.8 + Math.log(outlinks + 1) * 0.2;
  }

  calculateCO2(transferredBytes) {
    return transferredBytes * 0.5; // Simplified calculation in mg
  }

  getCarbonRating(transferredBytes) {
    if (transferredBytes < 50000) return 'A+';
    if (transferredBytes < 100000) return 'A';
    if (transferredBytes < 200000) return 'B';
    if (transferredBytes < 300000) return 'C';
    if (transferredBytes < 500000) return 'D';
    if (transferredBytes < 1000000) return 'E';
    return 'F';
  }

  getStatusText(statusCode) {
    const statusTexts = {
      200: 'OK', 301: 'Moved Permanently', 302: 'Found', 404: 'Not Found',
      500: 'Internal Server Error'
    };
    return statusTexts[statusCode] || 'Unknown';
  }

  determineIndexability(pageData) {
    if (pageData.metaRobots?.toLowerCase().includes('noindex')) {
      return 'Non-Indexable';
    }
    return 'Indexable';
  }

  getIndexabilityStatus(pageData) {
    return this.determineIndexability(pageData);
  }

  getReadabilityRating(fleschScore) {
    if (fleschScore >= 90) return 'Very Easy';
    if (fleschScore >= 80) return 'Easy';
    if (fleschScore >= 70) return 'Fairly Easy';
    if (fleschScore >= 60) return 'Standard';
    if (fleschScore >= 50) return 'Fairly Difficult';
    if (fleschScore >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  // ==================== DATABASE UTILITIES ====================

  /**
   * Execute database operation with retry logic
   */
  async executeWithRetry(operation, operationName = 'database operation') {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          await this.ensureDatabaseConnection();
        }
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Ensure database connection is active
   */
  async ensureDatabaseConnection() {
    try {
      await this.prisma.$connect();
      return true;
    } catch (error) {
      try {
        await this.prisma.$disconnect();
        this.prisma = new PrismaClient();
        await this.prisma.$connect();
        return true;
      } catch (reconnectError) {
        return false;
      }
    }
  }
}

module.exports = CrawlProcessor;