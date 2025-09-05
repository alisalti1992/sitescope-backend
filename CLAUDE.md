# Claude Code Configuration

## Project Overview
This is a sitescope-backend project - a comprehensive SEO web crawling service built with:
- **Crawlee** for web crawling with Puppeteer
- **Express** for REST API
- **Prisma** for database management
- **PostgreSQL** as the database
- **Swagger** for API documentation
- **Automatic sitemap discovery** for comprehensive crawling
- **Email verification** for crawl jobs
- **Two-step AI analysis** for scalability

## Development Commands

### Local Development
- `npm run dev` - Start development server with hot reload (includes auto-migration)
- `npm start` - Start production server (includes auto-migration)
- `npm run prisma:migrate` - Run database migrations with reset
- `npm run prisma:dev` - Start Prisma development mode
- `npm run prisma:deploy` - Deploy pending migrations (production-safe)
- `npm run prisma:status` - Check migration status
- `npm run migrate` - Run migrations and generate client

### Docker Development
- `npm run docker:dev` - Start development with Docker (rebuild + start + auto-migrate)
- `npm run docker:up` - Start Docker services (without rebuild)
- `npm run docker:down` - Stop all Docker services
- `npm run docker:build` - Build Docker containers
- `npm run docker:logs` - View application logs
- `npm run docker:shell` - Access shell inside app container

## API Endpoints
### Jobs Management
- `POST /jobs` - Create new crawl job
- `GET /jobs` - List all crawl jobs (with filtering)
- `GET /jobs/{id}` - Get specific job details
- `GET /jobs/{id}/pages/{pageId}` - Get detailed page data
- `POST /jobs/{id}/verify` - Verify a crawl job with a verification code
- `POST /jobs/{id}/resend-verification` - Resend verification code for a crawl job
- `GET /jobs/{id}/verification-status` - Get verification status for a crawl job

### Other Endpoints
- `GET /health` - Health check
- `GET /users` - User management
- `GET /migration/status` - Database migration status
- `POST /migration/apply` - Manually trigger migrations
- `GET /api-docs` - Swagger documentation

## Project Structure
- `src/server.js` - Main server entry point
- `src/routes/jobs.js` - Job management endpoints
- `src/services/crawlProcessor.js` - Background crawl processor
- `src/services/aiWebhookService.js` - Service for handling AI webhooks
- `src/config/` - Configuration files
- `prisma/schema.prisma` - Database schema
- `prompts/` - Prompts for AI analysis
- `storage/screenshots/` - Screenshot storage directory

## Background Processing
- Crawl processor checks for pending jobs every 10 seconds
- Automatically processes jobs: pending → waiting_verification → running → completed/failed
- Captures comprehensive page data and screenshots
- Stores results in `InternalLink` and `ExternalLink` tables with comprehensive SEO data
- Performs two-step AI analysis (page-level and crawl-level)

## Environment
- Server runs on port 5000
- Uses PostgreSQL database via Prisma
- Environment variables configured in `.env`
- Background crawl processor starts automatically
- Sitemap auto-discovery for comprehensive page coverage