/**
 * Robots.txt Crawler Service
 * 
 * Handles fetching and parsing robots.txt files for SEO crawling jobs.
 * Extracts rules, sitemap URLs, and other directives.
 */
class RobotsCrawler {
  constructor() {
    this.userAgent = 'SiteScope-Bot/1.0';
  }

  /**
   * Fetch and parse robots.txt for a given domain
   * @param {string} baseUrl - The base URL of the website
   * @returns {Promise<Object>} Parsed robots.txt data
   */
  async fetchRobotsTxt(baseUrl) {
    const startTime = Date.now();
    
    try {
      const baseUrlObj = new URL(baseUrl);
      const robotsUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}/robots.txt`;

      console.log(`🤖 Fetching robots.txt from: ${robotsUrl}`);
      
      // Fetch robots.txt with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(robotsUrl, {
        headers: {
          'User-Agent': this.userAgent
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        console.log(`⚠️ robots.txt not found or inaccessible: ${response.status}`);
        return {
          url: robotsUrl,
          content: null,
          statusCode: response.status,
          responseTime,
          sitemapUrls: [],
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const content = await response.text();
      const parsed = this.parseRobotsTxt(content);

      console.log(`✅ robots.txt fetched successfully. Found ${parsed.sitemapUrls.length} sitemap(s)`);

      return {
        url: robotsUrl,
        content,
        statusCode: response.status,
        responseTime,
        ...parsed
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ Failed to fetch robots.txt: ${error.message}`);
      
      return {
        url: `${new URL(baseUrl).protocol}//${new URL(baseUrl).host}/robots.txt`,
        content: null,
        statusCode: null,
        responseTime,
        sitemapUrls: [],
        error: error.message
      };
    }
  }

  /**
   * Parse robots.txt content and extract directives
   * @param {string} content - Raw robots.txt content
   * @returns {Object} Parsed data including rules and sitemap URLs
   */
  parseRobotsTxt(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const result = {
      userAgents: {},
      sitemapUrls: [],
      crawlDelay: null,
      rules: {
        disallow: [],
        allow: []
      }
    };

    let currentUserAgent = null;

    for (const line of lines) {
      // Skip comments
      if (line.startsWith('#')) continue;

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const directive = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();

      switch (directive) {
        case 'user-agent':
          currentUserAgent = value.toLowerCase();
          if (!result.userAgents[currentUserAgent]) {
            result.userAgents[currentUserAgent] = {
              disallow: [],
              allow: [],
              crawlDelay: null
            };
          }
          break;

        case 'disallow':
          if (currentUserAgent) {
            result.userAgents[currentUserAgent].disallow.push(value);
          }
          result.rules.disallow.push({
            userAgent: currentUserAgent,
            path: value
          });
          break;

        case 'allow':
          if (currentUserAgent) {
            result.userAgents[currentUserAgent].allow.push(value);
          }
          result.rules.allow.push({
            userAgent: currentUserAgent,
            path: value
          });
          break;

        case 'crawl-delay':
          const delay = parseInt(value);
          if (!isNaN(delay)) {
            if (currentUserAgent) {
              result.userAgents[currentUserAgent].crawlDelay = delay;
            }
            result.crawlDelay = delay;
          }
          break;

        case 'sitemap':
          // Clean up sitemap URL and add to list
          const sitemapUrl = value.trim();
          if (sitemapUrl && !result.sitemapUrls.includes(sitemapUrl)) {
            result.sitemapUrls.push(sitemapUrl);
          }
          break;

        default:
          // Ignore unknown directives
          break;
      }
    }

    return result;
  }

  /**
   * Check if a path is allowed for a specific user agent
   * @param {Object} robotsData - Parsed robots.txt data
   * @param {string} path - Path to check
   * @param {string} userAgent - User agent to check for (defaults to '*')
   * @returns {boolean} Whether the path is allowed
   */
  isPathAllowed(robotsData, path, userAgent = '*') {
    if (!robotsData.userAgents) return true;

    const agents = [userAgent.toLowerCase(), '*'];
    
    for (const agent of agents) {
      const rules = robotsData.userAgents[agent];
      if (!rules) continue;

      // Check disallow rules first (more restrictive)
      for (const disallowPath of rules.disallow) {
        if (this.pathMatches(path, disallowPath)) {
          // Check if there's a more specific allow rule
          for (const allowPath of rules.allow) {
            if (this.pathMatches(path, allowPath) && allowPath.length > disallowPath.length) {
              return true;
            }
          }
          return false;
        }
      }

      // If no disallow rule matched, check allow rules
      if (rules.allow.length > 0) {
        for (const allowPath of rules.allow) {
          if (this.pathMatches(path, allowPath)) {
            return true;
          }
        }
        return false; // Explicit allow rules present but none matched
      }
    }

    return true; // No rules found, assume allowed
  }

  /**
   * Check if a path matches a robots.txt pattern
   * @param {string} path - URL path to check
   * @param {string} pattern - robots.txt pattern (may contain wildcards)
   * @returns {boolean} Whether the path matches the pattern
   */
  pathMatches(path, pattern) {
    if (!pattern) return false;
    if (pattern === '/') return path === '/';
    if (pattern === '') return true;

    // Convert robots.txt pattern to regex
    // * matches any sequence of characters
    // $ at the end means exact match to end of path
    let regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\$$/, '$');
    
    // If pattern doesn't end with $ or *, it's a prefix match
    if (!pattern.endsWith('$') && !pattern.endsWith('*')) {
      regexPattern = '^' + regexPattern;
    } else {
      regexPattern = '^' + regexPattern;
    }

    try {
      const regex = new RegExp(regexPattern);
      return regex.test(path);
    } catch (error) {
      // If regex is invalid, fall back to simple prefix match
      return path.startsWith(pattern);
    }
  }

  /**
   * Get crawl delay for a specific user agent
   * @param {Object} robotsData - Parsed robots.txt data
   * @param {string} userAgent - User agent to check for
   * @returns {number|null} Crawl delay in seconds, or null if not specified
   */
  getCrawlDelay(robotsData, userAgent = '*') {
    if (!robotsData.userAgents) return null;

    const agents = [userAgent.toLowerCase(), '*'];
    
    for (const agent of agents) {
      const rules = robotsData.userAgents[agent];
      if (rules && rules.crawlDelay !== null) {
        return rules.crawlDelay;
      }
    }

    return robotsData.crawlDelay || null;
  }
}

module.exports = RobotsCrawler;