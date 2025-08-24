const { PuppeteerCrawler } = require("crawlee");
const { PrismaClient } = require("../generated/prisma");
const path = require("path");
const fs = require("fs");

class CrawlProcessor {
  constructor() {
    this.prisma = new PrismaClient();
    this.isProcessing = false;
    this.processingInterval = null;
  }

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
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  async start() {
    this.processingInterval = setInterval(() => {
      this.processPendingJobs();
    }, 10000); // Check every 10 seconds
    
    // Process immediately on start
    this.processPendingJobs();
  }

  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    await this.prisma.$disconnect();
  }

  async processPendingJobs() {
    if (this.isProcessing) {
      return; // Avoid concurrent processing
    }

    try {
      this.isProcessing = true;
      
      const pendingJobs = await this.executeWithRetry(
        () => this.prisma.crawlJob.findMany({
          where: {
            status: {
              in: ["pending", "running"]
            },
            canContinue: true
          },
          orderBy: {
            createdAt: "asc"
          },
          take: 1 // Process one job at a time
        }),
        'find pending and running jobs'
      );

      for (const job of pendingJobs) {
        await this.processJob(job);
      }
    } catch (error) {
    } finally {
      this.isProcessing = false;
    }
  }

  async processJob(job) {
    
    try {
      // Update job status to running and initialize progress if not already done
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          status: "running",
          startedAt: job.startedAt || new Date(),
          pagesRemaining: job.maxPages - job.pagesCrawled
        }
      });

      // Create crawler instance
      const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 1000,
        requestHandlerTimeoutSecs: 60,
        navigationTimeoutSecs: 30,
        requestHandler: async ({ request, page,enqueueLinks, log }) => {
          const startTime = Date.now();

          try {
            // Check if we've already crawled enough pages
            const crawledCount = await this.prisma.crawledPage.count({
              where: { jobId: job.id }
            });
            
            if (crawledCount >= job.maxPages) {
              return;
            }
            
            
            // Wait for page to load with timeout
            try {
              await page.waitForSelector('body', { timeout: 20000 });
            } catch (timeoutError) {
            }
            
            // Get response status (simplified approach)
            const statusCode = 200; // Default, will be captured from actual response if available
            
            // Extract comprehensive page data
            const pageData = await this.extractPageData(page, request.loadedUrl);
            pageData.statusCode = statusCode;
            
            const responseTime = Date.now() - startTime;
            
            // Take screenshot
            const screenshotPath = await this.takeScreenshot(page, job.id, request.loadedUrl);
            
            
            // Save crawled page data
            await this.prisma.crawledPage.create({
              data: {
                jobId: job.id,
                url: request.loadedUrl,
                title: pageData.title,
                metaDescription: pageData.metaDescription,
                metaKeywords: pageData.metaKeywords,
                htmlContent: pageData.htmlContent,
                textContent: pageData.textContent,
                screenshotPath: screenshotPath,
                statusCode: pageData.statusCode,
                responseTime: responseTime,
                wordCount: pageData.wordCount,
                linkCount: pageData.linkCount,
                imageCount: pageData.imageCount,
                h1Tags: pageData.h1Tags,
                h2Tags: pageData.h2Tags,
                h3Tags: pageData.h3Tags,
                canonicalUrl: pageData.canonicalUrl,
                ogTitle: pageData.ogTitle,
                ogDescription: pageData.ogDescription,
                ogImage: pageData.ogImage,
                twitterTitle: pageData.twitterTitle,
                twitterDescription: pageData.twitterDescription,
                twitterImage: pageData.twitterImage,
                lang: pageData.lang,
                charset: pageData.charset,
                viewport: pageData.viewport,
                robots: pageData.robots
              }
            });
            // Extract links from the current page and add them to the crawling queue
            const jobUrl = new URL(job.url);
            const baseUrl = `${jobUrl.protocol}//${jobUrl.hostname}`;
            
            
            // First, let's see all links on the page
            const allLinks = await page.evaluate(() => {
              const links = Array.from(document.querySelectorAll('a[href]'));
              return links.map(link => link.href).filter(href => href && href.startsWith('http'));
            });
            
            // Save discovered links to database
            for (const linkUrl of allLinks) {
              try {
                // Determine if link is crawlable
                let isCrawlable = true;
                
                // Skip files
                if (linkUrl.match(/\.(pdf|jpg|jpeg|png|gif|css|js|ico)$/i)) {
                  isCrawlable = false;
                }
                
                // Skip fragments/anchors (same page links)
                if (linkUrl.includes('#') && !linkUrl.includes('#content')) {
                  isCrawlable = false;
                }
                
                // Only crawl links from the exact same domain
                const linkUrlObj = new URL(linkUrl);
                if (linkUrlObj.hostname !== jobUrl.hostname) {
                  isCrawlable = false;
                }
                
                // Save discovered link (using upsert to avoid duplicates)
                await this.prisma.discoveredLink.upsert({
                  where: {
                    jobId_url: {
                      jobId: job.id,
                      url: linkUrl
                    }
                  },
                  update: {
                    // Don't update anything if it already exists
                  },
                  create: {
                    jobId: job.id,
                    url: linkUrl,
                    sourceUrl: request.loadedUrl,
                    isCrawlable: isCrawlable
                  }
                });
              } catch (linkError) {
                // Skip individual link errors
              }
            }
            
            // Get count of unique crawlable links discovered so far
            const totalUniqueLinks = await this.prisma.discoveredLink.count({
              where: { 
                jobId: job.id,
                isCrawlable: true
              }
            });

            // Update job progress with correct unique link count
            const updatedCrawledCount = crawledCount + 1;
            await this.prisma.crawlJob.update({
              where: { id: job.id },
              data: {
                pagesCrawled: updatedCrawledCount,
                pagesRemaining: job.maxPages - updatedCrawledCount,
                lastCrawledUrl: request.loadedUrl,
                totalUniquePagesFound: totalUniqueLinks
              }
            });
            
            try {
              const linksEnqueued = await enqueueLinks({
                globs: [`${baseUrl}/**`],
                limit: 50,
                transformRequestFunction: (req) => {
                  
                  // Skip files
                  if (req.url.match(/\.(pdf|jpg|jpeg|png|gif|css|js|ico)$/i)) {
                    return false;
                  }
                  
                  // Skip fragments/anchors (same page links)
                  if (req.url.includes('#') && !req.url.includes('#content')) {
                    return false;
                  }
                  
                  // Only accept links from the exact same domain
                  const reqUrl = new URL(req.url);
                  if (reqUrl.hostname !== jobUrl.hostname) {
                    return false;
                  }
                  
                  return req;
                }
              });
            } catch (error) {
            }

            log.info(`✅ Successfully crawled: ${request.loadedUrl}`);
            
          } catch (error) {
            log.error(`Error crawling ${request.loadedUrl}:`, error.message);
            
            // Save failed page with error info
            try {
              await this.prisma.crawledPage.create({
                data: {
                  jobId: job.id,
                  url: request.loadedUrl,
                  statusCode: 0,
                  responseTime: Date.now() - startTime,
                  title: `Error: ${error.message}`
                }
              });
            } catch (dbError) {
            }
          }
        },
        
        failedRequestHandler: async ({ request, error, log }) => {
          log.error(`Failed to crawl ${request.url}: ${error.message}`);
          
          // Save failed request to database
          try {
            await this.prisma.crawledPage.create({
              data: {
                jobId: job.id,
                url: request.url,
                statusCode: 0,
                responseTime: 0,
                title: `Failed: ${error.message}`
              }
            });
          } catch (dbError) {
          }
        }
      });

      // Start crawling
      await crawler.run([{ url: job.url }]);
      
      // Check final status and mark as completed only if we've reached maxPages or no more links
      const finalCrawledCount = await this.prisma.crawledPage.count({
        where: { jobId: job.id }
      });
      
      if (finalCrawledCount >= job.maxPages) {
        await this.prisma.crawlJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            pagesCrawled: finalCrawledCount,
            pagesRemaining: 0
          }
        });
      } else {
        // Job is still running, will be picked up in next cycle
        await this.prisma.crawlJob.update({
          where: { id: job.id },
          data: {
            pagesCrawled: finalCrawledCount,
            pagesRemaining: job.maxPages - finalCrawledCount
          }
        });
      }

      
    } catch (error) {
      
      // Mark job as failed
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: error.message
        }
      });
    }
  }

  async extractPageData(page, url) {
    return await page.evaluate((currentUrl) => {
      const data = {
        url: currentUrl,
        title: document.title || null,
        htmlContent: document.documentElement.outerHTML,
        textContent: document.body ? document.body.innerText : null,
        statusCode: 200, // Will be overridden if different
        h1Tags: [],
        h2Tags: [],
        h3Tags: [],
        linkCount: 0,
        imageCount: 0,
        wordCount: 0
      };

      // Extract meta tags
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      data.metaDescription = getMetaContent('description');
      data.metaKeywords = getMetaContent('keywords');
      data.ogTitle = getMetaContent('og:title');
      data.ogDescription = getMetaContent('og:description');
      data.ogImage = getMetaContent('og:image');
      data.twitterTitle = getMetaContent('twitter:title');
      data.twitterDescription = getMetaContent('twitter:description');
      data.twitterImage = getMetaContent('twitter:image');
      data.robots = getMetaContent('robots');
      data.viewport = getMetaContent('viewport');

      // Extract other meta info
      const charsetMeta = document.querySelector('meta[charset]');
      data.charset = charsetMeta ? charsetMeta.getAttribute('charset') : null;
      
      const langAttr = document.documentElement.getAttribute('lang');
      data.lang = langAttr || null;

      // Extract canonical URL
      const canonical = document.querySelector('link[rel="canonical"]');
      data.canonicalUrl = canonical ? canonical.getAttribute('href') : null;

      // Extract headings
      document.querySelectorAll('h1').forEach(h1 => {
        if (h1.textContent.trim()) {
          data.h1Tags.push(h1.textContent.trim());
        }
      });

      document.querySelectorAll('h2').forEach(h2 => {
        if (h2.textContent.trim()) {
          data.h2Tags.push(h2.textContent.trim());
        }
      });

      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.textContent.trim()) {
          data.h3Tags.push(h3.textContent.trim());
        }
      });

      // Count elements
      data.linkCount = document.querySelectorAll('a[href]').length;
      data.imageCount = document.querySelectorAll('img').length;

      // Count words in text content
      if (data.textContent) {
        data.wordCount = data.textContent.split(/\s+/).filter(word => word.length > 0).length;
      }

      return data;
    }, url);
  }

  async takeScreenshot(page, jobId, url) {
    try {
      // Create screenshots directory if it doesn't exist
      const screenshotsDir = path.join(process.cwd(), 'storage', 'screenshots', jobId.toString());
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      // Generate filename from URL
      const urlObj = new URL(url);
      const filename = `${urlObj.hostname}_${urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotsDir, filename);

      // Take screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      // Return relative path for storage
      return `screenshots/${jobId}/${filename}`;
      
    } catch (error) {
      return null;
    }
  }
}

module.exports = CrawlProcessor;