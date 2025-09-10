/**
 * Sitemap Crawler Service
 * 
 * Handles fetching and parsing sitemap.xml files including sitemap index files
 * that reference multiple child sitemaps. Supports recursive sitemap discovery.
 */
class SitemapCrawler {
  constructor() {
    this.userAgent = 'SiteScope-Bot/1.0';
    this.maxSitemaps = 50; // Limit to prevent infinite loops
    this.processedSitemaps = new Set();
  }

  /**
   * Discover and crawl all sitemaps for a domain
   * @param {string} baseUrl - The base URL of the website
   * @param {Array} robotsSitemapUrls - Sitemap URLs found in robots.txt
   * @returns {Promise<Array>} Array of sitemap data objects
   */
  async discoverAndCrawlSitemaps(baseUrl, robotsSitemapUrls = []) {
    console.log(`🗺️ Starting sitemap discovery for: ${baseUrl}`);
    
    this.processedSitemaps.clear();
    const allSitemaps = [];
    const sitemapUrls = new Set();

    // Add robots.txt sitemaps
    robotsSitemapUrls.forEach(url => sitemapUrls.add(url));

    // Try common sitemap locations if no robots.txt sitemaps
    if (sitemapUrls.size === 0) {
      const baseUrlObj = new URL(baseUrl);
      const baseOrigin = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
      
      const commonPaths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemaps.xml',
        '/sitemap1.xml'
      ];

      for (const path of commonPaths) {
        sitemapUrls.add(`${baseOrigin}${path}`);
      }
    }

    // Process each discovered sitemap URL
    for (const url of sitemapUrls) {
      if (allSitemaps.length >= this.maxSitemaps) {
        console.log(`⚠️ Reached maximum sitemap limit (${this.maxSitemaps})`);
        break;
      }

      const sitemapData = await this.fetchAndParseSitemap(url, null, 'initial-discovery');
      if (sitemapData) {
        allSitemaps.push(sitemapData);
        
        // If this is a sitemap index, process child sitemaps
        if (sitemapData.childSitemapUrls && sitemapData.childSitemapUrls.length > 0) {
          await this.processChildSitemaps(sitemapData, allSitemaps);
        }
      }
    }

    console.log(`✅ Sitemap discovery complete. Found ${allSitemaps.length} sitemap(s)`);
    return allSitemaps;
  }

  /**
   * Process child sitemaps from a sitemap index
   * @param {Object} parentSitemap - Parent sitemap data
   * @param {Array} allSitemaps - Array to collect all sitemaps
   */
  async processChildSitemaps(parentSitemap, allSitemaps) {
    for (const childUrl of parentSitemap.childSitemapUrls) {
      if (allSitemaps.length >= this.maxSitemaps) break;

      const childSitemap = await this.fetchAndParseSitemap(
        childUrl, 
        parentSitemap.id, 
        'sitemap-index'
      );
      
      if (childSitemap) {
        allSitemaps.push(childSitemap);
        
        // Recursively process if this child is also an index
        if (childSitemap.childSitemapUrls && childSitemap.childSitemapUrls.length > 0) {
          await this.processChildSitemaps(childSitemap, allSitemaps);
        }
      }
    }
  }

  /**
   * Fetch and parse a single sitemap
   * @param {string} sitemapUrl - URL of the sitemap
   * @param {number|null} parentId - ID of parent sitemap if this is a child
   * @param {string} discoveredFrom - How this sitemap was discovered
   * @returns {Promise<Object|null>} Parsed sitemap data or null if failed
   */
  async fetchAndParseSitemap(sitemapUrl, parentId = null, discoveredFrom = 'unknown') {
    if (this.processedSitemaps.has(sitemapUrl)) {
      console.log(`⏭️ Skipping already processed sitemap: ${sitemapUrl}`);
      return null;
    }

    this.processedSitemaps.add(sitemapUrl);
    const startTime = Date.now();

    try {
      console.log(`🔍 Fetching sitemap: ${sitemapUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/xml, text/xml, */*'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        console.log(`⚠️ Sitemap not accessible: ${sitemapUrl} (${response.status})`);
        return {
          url: sitemapUrl,
          parentSitemapId: parentId,
          content: null,
          statusCode: response.status,
          responseTime,
          urlCount: 0,
          urls: [],
          childSitemapUrls: [],
          discoveredFrom,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const xmlContent = await response.text();
      const parsed = this.parseSitemapXML(xmlContent);

      console.log(`✅ Parsed sitemap: ${sitemapUrl} - ${parsed.urlCount} URLs, ${parsed.childSitemapUrls.length} child sitemaps`);

      return {
        url: sitemapUrl,
        parentSitemapId: parentId,
        content: xmlContent,
        statusCode: response.status,
        responseTime,
        discoveredFrom,
        ...parsed
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ Failed to fetch sitemap ${sitemapUrl}:`, error.message);
      
      return {
        url: sitemapUrl,
        parentSitemapId: parentId,
        content: null,
        statusCode: null,
        responseTime,
        urlCount: 0,
        urls: [],
        childSitemapUrls: [],
        discoveredFrom,
        error: error.message
      };
    }
  }

  /**
   * Parse sitemap XML content
   * @param {string} xmlContent - Raw XML content
   * @returns {Object} Parsed sitemap data
   */
  parseSitemapXML(xmlContent) {
    const result = {
      urlCount: 0,
      urls: [],
      childSitemapUrls: [],
      lastMod: null,
      changeFreq: null,
      priority: null
    };

    try {
      // Check if this is a sitemap index
      if (xmlContent.includes('<sitemapindex') || xmlContent.includes('<sitemap>')) {
        return this.parseSitemapIndex(xmlContent);
      }

      // Parse regular sitemap
      return this.parseRegularSitemap(xmlContent);

    } catch (error) {
      console.error('Error parsing sitemap XML:', error.message);
      return result;
    }
  }

  /**
   * Parse a sitemap index file
   * @param {string} xmlContent - XML content of sitemap index
   * @returns {Object} Parsed index data
   */
  parseSitemapIndex(xmlContent) {
    const result = {
      urlCount: 0,
      urls: [],
      childSitemapUrls: [],
      lastMod: null,
      changeFreq: null,
      priority: null
    };

    // Extract sitemap URLs from index
    const sitemapRegex = /<sitemap[^>]*>([\s\S]*?)<\/sitemap>/gi;
    const locRegex = /<loc>(.*?)<\/loc>/i;
    const lastModRegex = /<lastmod>(.*?)<\/lastmod>/i;

    let match;
    while ((match = sitemapRegex.exec(xmlContent)) !== null) {
      const sitemapBlock = match[1];
      const locMatch = locRegex.exec(sitemapBlock);
      
      if (locMatch) {
        const url = locMatch[1].trim();
        result.childSitemapUrls.push(url);

        // Extract lastmod for the sitemap index itself
        const lastModMatch = lastModRegex.exec(sitemapBlock);
        if (lastModMatch && !result.lastMod) {
          result.lastMod = new Date(lastModMatch[1]);
        }
      }
    }

    return result;
  }

  /**
   * Parse a regular sitemap file
   * @param {string} xmlContent - XML content of sitemap
   * @returns {Object} Parsed sitemap data
   */
  parseRegularSitemap(xmlContent) {
    const result = {
      urlCount: 0,
      urls: [],
      childSitemapUrls: [],
      lastMod: null,
      changeFreq: null,
      priority: null
    };

    // Extract URLs from sitemap
    const urlRegex = /<url[^>]*>([\s\S]*?)<\/url>/gi;
    const locRegex = /<loc>(.*?)<\/loc>/i;
    const lastModRegex = /<lastmod>(.*?)<\/lastmod>/i;
    const changeFreqRegex = /<changefreq>(.*?)<\/changefreq>/i;
    const priorityRegex = /<priority>(.*?)<\/priority>/i;

    let match;
    const urls = [];

    while ((match = urlRegex.exec(xmlContent)) !== null) {
      const urlBlock = match[1];
      const locMatch = locRegex.exec(urlBlock);
      
      if (locMatch) {
        const urlData = {
          loc: locMatch[1].trim(),
          lastmod: null,
          changefreq: null,
          priority: null
        };

        // Extract optional fields
        const lastModMatch = lastModRegex.exec(urlBlock);
        if (lastModMatch) {
          try {
            urlData.lastmod = lastModMatch[1].trim();
            if (!result.lastMod) {
              result.lastMod = new Date(urlData.lastmod);
            }
          } catch (e) {
            // Invalid date format, keep as string
          }
        }

        const changeFreqMatch = changeFreqRegex.exec(urlBlock);
        if (changeFreqMatch) {
          urlData.changefreq = changeFreqMatch[1].trim();
          if (!result.changeFreq) {
            result.changeFreq = urlData.changefreq;
          }
        }

        const priorityMatch = priorityRegex.exec(urlBlock);
        if (priorityMatch) {
          const priority = parseFloat(priorityMatch[1].trim());
          if (!isNaN(priority)) {
            urlData.priority = priority;
            if (result.priority === null) {
              result.priority = priority;
            }
          }
        }

        urls.push(urlData);
      }
    }

    result.urls = urls;
    result.urlCount = urls.length;

    return result;
  }

  /**
   * Extract URLs from all sitemaps for crawling
   * @param {Array} sitemaps - Array of sitemap data objects
   * @param {string} baseUrl - Base URL to filter internal URLs
   * @returns {Array} Array of URLs to crawl
   */
  extractUrlsForCrawling(sitemaps, baseUrl) {
    const urls = new Set();
    const baseUrlObj = new URL(baseUrl);

    for (const sitemap of sitemaps) {
      if (!sitemap.urls || sitemap.urls.length === 0) continue;

      for (const urlData of sitemap.urls) {
        try {
          const url = urlData.loc;
          const urlObj = new URL(url);
          
          // Check if hostname matches, with www/non-www variation support
          const isValidHostname = this.isMatchingDomain(urlObj.hostname, baseUrlObj.hostname);
          
          if (isValidHostname) {
            urls.add(url);
          }
        } catch (error) {
          // Skip invalid URLs
          console.log(`⚠️ Skipping invalid URL from sitemap: ${urlData.loc}`);
        }
      }
    }

    const urlArray = Array.from(urls);
    console.log(`🎯 Extracted ${urlArray.length} URLs from sitemaps for crawling`);
    
    // Limit URLs to prevent overwhelming the crawler
    return urlArray.slice(0, 2000);
  }

  /**
   * Check if two domains match, accounting for www/non-www variations
   * @param {string} hostname1 - First hostname
   * @param {string} hostname2 - Second hostname
   * @returns {boolean} True if domains match
   */
  isMatchingDomain(hostname1, hostname2) {
    // Direct match
    if (hostname1 === hostname2) return true;
    
    // Check www variations
    const hostname1WithoutWww = hostname1.replace(/^www\./, '');
    const hostname2WithoutWww = hostname2.replace(/^www\./, '');
    
    return hostname1WithoutWww === hostname2WithoutWww;
  }

  /**
   * Reset the crawler state for a new job
   */
  reset() {
    this.processedSitemaps.clear();
  }
}

module.exports = SitemapCrawler;