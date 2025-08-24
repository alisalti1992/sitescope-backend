# Development Guide

## Prerequisites

Choose one of the following development approaches:

### Option 1: Docker Development (Recommended)
- Docker and Docker Compose
- No other dependencies required

### Option 2: Local Development
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn package manager

## Getting Started

### Option 1: Docker Development (Recommended)

This is the easiest way to get started. Everything runs in containers with hot reload.

```bash
# Clone the repository
git clone <repository-url>
cd sitescope-backend

# Start development environment (builds and starts all services)
npm run docker:dev
```

That's it! The application will be available at `http://localhost:4000` with:
- Automatic code reloading when you change files
- PostgreSQL database automatically configured
- All dependencies handled in containers

#### Docker Development Commands

```bash
# Start development with rebuild
npm run docker:dev

# Start without rebuilding (if already built)
npm run docker:up

# Stop all services
npm run docker:down

# View application logs
npm run docker:logs

# Access shell inside the app container
npm run docker:shell

# Rebuild containers
npm run docker:build
```

### Option 2: Local Development

If you prefer to run Node.js locally:

#### 1. Environment Setup

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
PORT=4000
NODE_ENV=development
```

#### 2. Database Setup

```bash
# Start PostgreSQL with Docker (recommended)
docker-compose up postgres -d

# OR install and start PostgreSQL locally
# Then create database: createdb sitescope_db

# Install dependencies
npm install

# Run database migrations
npm run prisma:migrate

# Generate Prisma client
npx prisma generate
```

#### 3. Start Development Server

```bash
# Start development server with hot reload
npm run dev
```

This will start:
- Nodemon for automatic server restart on file changes
- Server on port 4000 (or PORT from .env)

## Development Scripts

### Local Development
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm run prisma:dev` | Start Prisma development mode |
| `npm run prisma:migrate` | Run database migrations with reset |

### Docker Development
| Command | Description |
|---------|-------------|
| `npm run docker:dev` | Start development with Docker (rebuild + start) |
| `npm run docker:up` | Start Docker services (without rebuild) |
| `npm run docker:down` | Stop all Docker services |
| `npm run docker:build` | Build Docker containers |
| `npm run docker:logs` | View application logs |
| `npm run docker:shell` | Access shell inside app container |

## Project Architecture

### Core Components

- **Express Server** (`src/server.js`) - Main application server
- **Background Processor** (`src/services/crawlProcessor.js`) - Handles crawl job processing
- **API Routes** (`src/routes/`) - REST endpoint definitions
- **Database Schema** (`prisma/schema.prisma`) - Data models and relationships

### Key Features

1. **Job Management API** - Create, retrieve, and monitor crawl jobs
2. **Background Processing** - Automatic job processing every 10 seconds
3. **Data Extraction** - Comprehensive SEO page data capture including screenshots
4. **Sitemap Auto-Discovery** - Automatically finds and crawls sitemap.xml files
5. **Link Analysis** - Internal/external link tracking with relationship mapping
6. **REST API** - Full CRUD operations for jobs and pages
7. **Swagger Documentation** - Interactive API documentation at `/api-docs`

## Database Schema

The application uses Prisma ORM with PostgreSQL. Key entities:

- **CrawlJob** - Crawl job configuration and status with sitemap options
- **InternalLink** - Crawled pages with comprehensive SEO data and metrics
- **ExternalLink** - External links found during crawling
- **Inlink** - Link relationships between pages (internal and external)
- **User** - User management (if applicable)

## API Development

### Adding New Endpoints

1. Create route handler in `src/routes/`
2. Add Swagger JSDoc comments for documentation
3. Register route in `src/server.js`

### Example Route Structure

```javascript
/**
 * @swagger
 * /api/endpoint:
 *   get:
 *     summary: Description
 *     responses:
 *       200:
 *         description: Success response
 */
router.get('/endpoint', async (req, res) => {
  // Implementation
});
```

## Background Processing

The crawl processor (`src/services/crawlProcessor.js`) automatically:

1. Checks for pending jobs every 10 seconds
2. Discovers and parses sitemap.xml files when enabled
3. Processes jobs using Crawlee and Puppeteer
4. Extracts comprehensive SEO data (meta tags, headings, performance metrics)
5. Analyzes internal/external link relationships
6. Updates job status (pending → running → completed/failed)
7. Stores extracted data and screenshots
8. Handles error cases and retries

## File Storage

- **Screenshots**: Stored in `storage/screenshots/`
- **Extracted Data**: Stored in PostgreSQL via Prisma

## Development Workflow

### 1. Code Changes
- Make changes to source files
- Nodemon automatically restarts server
- Check logs for any errors

### 2. Database Changes
- Update `prisma/schema.prisma`
- Run `npm run prisma:migrate`
- Restart development server

### 3. Testing API
- Use Swagger UI at `http://localhost:4000/api-docs`
- Test endpoints with sample data
- Check database for expected changes

## Debugging

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port 4000
   netstat -ano | findstr :4000
   # Kill process by PID
   taskkill /PID <PID> /F
   ```

2. **Database connection issues**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env
   - Run `npx prisma db push` to sync schema

3. **Missing dependencies**
   ```bash
   # Clean install
   rm -rf node_modules package-lock.json
   npm install
   ```

### Logging

The application uses console logging. Check terminal output for:
- Server startup messages
- Crawl job processing logs
- Error messages and stack traces

## Code Style

- Use async/await for asynchronous operations
- Follow existing naming conventions
- Add JSDoc comments for new functions
- Keep routes focused and single-purpose

## Performance Considerations

- Background processor runs every 10 seconds (configurable)
- Screenshots are stored locally (consider cloud storage for production)
- Database queries should use proper indexing
- Consider rate limiting for production API

## Security Notes

- Validate all input parameters
- Use proper error handling to avoid information leakage
- Consider authentication/authorization for production
- Sanitize URLs before crawling to prevent SSRF attacks