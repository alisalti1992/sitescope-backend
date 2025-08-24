# Claude Code Configuration

## Project Overview
This is a sitescope-backend project - a comprehensive SEO web crawling service built with:
- **Crawlee** for web crawling with Puppeteer
- **Express** for REST API
- **Prisma** for database management
- **PostgreSQL** as the database
- **Swagger** for API documentation
- **Automatic sitemap discovery** for comprehensive crawling

## Development Commands
- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:dev` - Start Prisma development mode

## API Endpoints
### Jobs Management
- `POST /jobs` - Create new crawl job
- `GET /jobs` - List all crawl jobs (with filtering)
- `GET /jobs/{id}` - Get specific job details
- `GET /jobs/{id}/pages/{pageId}` - Get detailed page data

### Other Endpoints
- `GET /health` - Health check
- `GET /users` - User management
- `GET /api-docs` - Swagger documentation

## Project Structure
- `src/server.js` - Main server entry point
- `src/routes/jobs.js` - Job management endpoints
- `src/services/crawlProcessor.js` - Background crawl processor
- `src/config/` - Configuration files
- `prisma/schema.prisma` - Database schema
- `storage/screenshots/` - Screenshot storage directory

## Background Processing
- Crawl processor checks for pending jobs every 10 seconds
- Automatically processes jobs: pending → running → completed/failed
- Captures comprehensive page data and screenshots
- Stores results in `InternalLink` and `ExternalLink` tables with comprehensive SEO data

## Environment
- Server runs on port 4000
- Uses PostgreSQL database via Prisma
- Environment variables configured in `.env`
- Background crawl processor starts automatically
- Sitemap auto-discovery for comprehensive page coverage