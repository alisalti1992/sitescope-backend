# SiteScope Backend

A powerful web crawling backend service built with Crawlee, Express, and PostgreSQL. This service provides a REST API for managing web crawling jobs, extracting comprehensive page data, and storing results with screenshots.

## Features

- 🕷️ **Advanced Web Crawling** - Powered by Crawlee and Puppeteer for reliable data extraction
- 🗺️ **Sitemap Auto-Discovery** - Automatically finds and crawls sitemap.xml files for comprehensive coverage
- 🔄 **Background Processing** - Automatic job processing with status tracking
- 📸 **Screenshot Capture** - Optional screenshot generation for crawled pages
- 🔍 **SEO Analysis** - Comprehensive page analysis including meta tags, headings, performance metrics
- 📊 **Link Analysis** - Internal/external link tracking with relationship mapping
- 🗄️ **Database Storage** - PostgreSQL with Prisma ORM for robust data management
- 🔗 **REST API** - Complete CRUD operations for jobs and pages
- 📖 **API Documentation** - Interactive Swagger/OpenAPI documentation
- ⚡ **Real-time Status** - Live job status updates and monitoring
- 📧 **Email Verification** - Requires email verification before starting a crawl job
- 🤖 **Two-step AI Analysis** - Scalable AI analysis for large websites
- 🔄 **Automatic Migrations** - Database schema updates applied automatically on startup

## Quick Start

### Option 1: Docker (Recommended)

The easiest way to get started - no dependencies needed except Docker.

```bash
# Clone the repository
git clone https://github.com/alisalti1992/sitescope-backend
cd sitescope-backend

# Start everything with Docker
npm run docker:dev
```

That's it! The server will start on `http://localhost:5000` with:
- Automatic hot reload on code changes
- PostgreSQL database automatically configured
- Database migrations applied automatically
- API documentation available at `/api-docs`

### Option 2: Local Development

If you prefer running locally:

#### Prerequisites
- Node.js 18+
- PostgreSQL (or use Docker for database only)
- npm

#### Installation

```bash
# Clone the repository
git clone https://github.com/alisalti1992/sitescope-backend
cd sitescope-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database configuration

# Start PostgreSQL (with Docker)
docker-compose up postgres -d

# Start development server (migrations run automatically)
npm run dev
```

The server will start on `http://localhost:5000` with API documentation available at `/api-docs`.

## API Endpoints

### Jobs Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs` | Create a new crawl job |
| GET | `/jobs` | List all jobs with filtering |
| GET | `/jobs/{id}` | Get specific job details |
| GET | `/jobs/{id}/pages/{pageId}` | Get detailed page data |
| POST | `/jobs/{id}/verify` | Verify a crawl job with a verification code |
| POST | `/jobs/{id}/resend-verification` | Resend verification code for a crawl job |
| GET | `/jobs/{id}/verification-status` | Get verification status for a crawl job |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check endpoint |
| GET | `/api-docs` | Swagger API documentation |
| GET | `/users` | User management |

## Example Usage

### Create a Crawl Job

```bash
curl -X POST http://localhost:5000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "maxPages": 10,
    "ai": true,
    "email": "user@example.com",
    "takeScreenshots": true,
    "crawlSitemap": true
  }'
```

### Check Job Status

```bash
curl http://localhost:5000/jobs/1
```

### Get Page Data

```bash
curl http://localhost:5000/jobs/1/pages/1
```

## Technology Stack

- **Backend Framework**: Express.js
- **Web Crawling**: Crawlee + Puppeteer
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Documentation**: Swagger/OpenAPI
- **Process Management**: Background job processor

## Project Structure

```
sitescope-backend/
├── src/
│   ├── server.js              # Main server entry point
│   ├── routes/                # API route definitions
│   │   ├── jobs.js           # Job management endpoints
│   │   ├── health.js         # Health check
│   │   └── users.js          # User management
│   ├── services/
│   │   ├── crawlProcessor.js  # Background crawl processor
│   │   └── aiWebhookService.js # Service for handling AI webhooks
│   └── config/
│       └── swaggerOptions.js  # API documentation config
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migrations
├── prompts/
│   ├── page-analyzer-prompt.md
│   └── crawl-analyzer-prompt.md
├── storage/
│   └── screenshots/          # Screenshot storage
└── DEVELOPMENT.md            # Development guide
```

## How It Works

1. **Job Creation**: Submit crawl jobs via REST API with target URLs and configuration
2. **Email Verification**: If enabled, an email with a verification code is sent to the user
3. **Background Processing**: Automated processor checks for pending jobs every 10 seconds
4. **Web Crawling**: Crawlee with Puppeteer extracts data, captures screenshots, follows links
5. **Data Storage**: Results stored in PostgreSQL with comprehensive page metadata
6. **AI Analysis**: If enabled, a two-step AI analysis is performed on the crawled data
7. **Status Tracking**: Real-time job status updates (pending → waiting_verification → running → completed/failed)

## Development

For detailed development instructions, see [DEVELOPMENT.md](./DEVELOPMENT.md).

For database migration information, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

### Docker Development
```bash
# Start development with hot reload
npm run docker:dev

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Local Development  
```bash
# Development with hot reload
npm run dev

# Production build
npm start

# Database operations
npx prisma migrate dev
```

## Configuration

Key environment variables (copy from `.env.example`):

```env
# Server Config
PORT=5000
BASE_URL=http://localhost:5000
PROJECT_NAME="SiteScope"

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/sitescope_db"

# AI Webhook Configuration (Optional)
PAGE_ANALYZER_WEBHOOK_URL="https://your-ai-service.com/analyze-page"
CRAWL_ANALYZER_WEBHOOK_URL="https://your-ai-service.com/analyze-crawl"

# Email Reports (Optional)
FEATURE_EMAIL_REPORTS=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password

# User Management (Optional)
FEATURE_USER_MANAGEMENT=true
JWT_SECRET=your-super-secret-jwt-key
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
- Create an issue in the repository
- Check the [DEVELOPMENT.md](./DEVELOPMENT.md) for troubleshooting
- Review API documentation at `/api-docs`
