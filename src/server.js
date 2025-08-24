require("dotenv").config();
const express = require("express");
const CrawlProcessor = require("./services/crawlProcessor");

const app = express();
const crawlProcessor = new CrawlProcessor();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
app.use(express.json());

// Setup Swagger
const setupSwagger = require('./swagger');
setupSwagger(app);

// Root Route
app.get("/", (req, res) => {
    res.json(`✅ Server running at ${BASE_URL}`);
});

// Users Routes
const userRoutes = require("./routes/users");
app.use('/users', userRoutes);

// Health Routes
const healthRoutes = require("./routes/health");
app.use('/health', healthRoutes);

// Jobs Routes
const jobRoutes = require("./routes/jobs");
app.use('/jobs', jobRoutes);

// Start server
app.listen(PORT, () => {
    console.log('Starting Server Waiting for 3 seconds to start Database');
    setTimeout(function () {
        console.log(`✅ Server running at ${BASE_URL}`);
        console.log(`📄 Swagger docs available at ${BASE_URL}/api-docs`);
        
        // Start crawl processor
        crawlProcessor.start();
        console.log(`🔄 Crawl processor started`);
    }, 3000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await crawlProcessor.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await crawlProcessor.stop();
    process.exit(0);
});
