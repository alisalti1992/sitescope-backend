require("dotenv").config();
const express = require("express");
const CrawlProcessor = require("./services/crawlProcessor");
const UserService = require("./services/userService");
const CronService = require("./services/cronService");
const MigrationService = require("./services/migrationService");

const app = express();
const crawlProcessor = new CrawlProcessor();
const userService = new UserService();
const cronService = new CronService();
const migrationService = new MigrationService();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
app.use(express.json());

// Setup Swagger
const setupSwagger = require('./swagger');
setupSwagger(app);

// Root Route
app.get("/", (req, res) => {
    res.json({
        message: `✅ Server running at ${BASE_URL}`,
        api: `${BASE_URL}/api`,
        docs: `${BASE_URL}/api-docs`,
        features: {
            userManagement: process.env.FEATURE_USER_MANAGEMENT === 'true',
            emailReports: process.env.FEATURE_EMAIL_REPORTS === 'true'
        }
    });
});

// API Routes under /api prefix
const apiRouter = express.Router();

// Authentication Routes (no auth required for login)
const authRoutes = require("./routes/auth");
apiRouter.use('/auth', authRoutes);

// User Management Routes (auth required)
const userRoutes = require("./routes/users");
apiRouter.use('/users', userRoutes);

// Jobs Routes (auth required)
const jobRoutes = require("./routes/jobs");
apiRouter.use('/jobs', jobRoutes);

// Health Routes (no auth required)
const healthRoutes = require("./routes/health");
app.use('/health', healthRoutes);

// Migration Routes (no auth required for status, consider adding auth for apply)
const migrationRoutes = require("./routes/migration");
apiRouter.use('/migration', migrationRoutes);

// Mount API router
app.use('/api', apiRouter);

// Start server
app.listen(PORT, async () => {
    try {
        console.log('🚀 Starting SiteScope Backend...');
        console.log(`🌐 Server running at ${BASE_URL}`);
        console.log(`📄 Swagger docs available at ${BASE_URL}/api-docs`);
        console.log(`🔗 API endpoints available at ${BASE_URL}/api`);
        
        // Run database migrations first
        console.log('🔄 Running database migration workflow...');
        const migrationResult = await migrationService.runMigrationWorkflow();
        
        if (!migrationResult.success) {
            console.error('💥 Critical: Migration failed, shutting down server');
            console.error('Error:', migrationResult.error);
            process.exit(1);
        }
        
        if (migrationResult.migrationApplied) {
            console.log('✅ Database migrations applied successfully');
        } else {
            console.log('📋 No migrations needed, database is up to date');
        }
        
        // Initialize user management system
        await userService.initialize();
        console.log('👤 User management system initialized');
        
        // Start crawl processor
        crawlProcessor.start();
        console.log('🕷️  Crawl processor started');

        // Start cron service (it has its own logging)
        cronService.start();
        
        console.log('🎉 SiteScope Backend fully initialized and ready!');
        
    } catch (error) {
        console.error('💥 Failed to initialize server:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await crawlProcessor.stop();
    cronService.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await crawlProcessor.stop();
    cronService.stop();
    process.exit(0);
});
