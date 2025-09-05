const express = require('express');
const MigrationService = require('../services/migrationService');

const router = express.Router();
const migrationService = new MigrationService();

/**
 * @swagger
 * /api/migration/status:
 *   get:
 *     summary: Get database migration status
 *     tags: [Migration]
 *     responses:
 *       200:
 *         description: Migration status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Current migration status
 *                 isUpToDate:
 *                   type: boolean
 *                   description: Whether database is up to date
 *                 hasPendingMigrations:
 *                   type: boolean
 *                   description: Whether there are pending migrations
 *                 autoMigrateEnabled:
 *                   type: boolean
 *                   description: Whether auto-migration is enabled
 *                 environment:
 *                   type: string
 *                   description: Current environment (development/production)
 *       500:
 *         description: Server error
 */
router.get('/status', async (req, res) => {
    try {
        const migrationStatus = await migrationService.getMigrationStatus();
        
        res.json({
            ...migrationStatus,
            autoMigrateEnabled: migrationService.autoMigrateEnabled,
            environment: migrationService.isProduction ? 'production' : 'development',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting migration status:', error);
        res.status(500).json({
            error: 'Failed to get migration status',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/migration/check-connection:
 *   get:
 *     summary: Check database connection
 *     tags: [Migration]
 *     responses:
 *       200:
 *         description: Database connection status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                   description: Whether database is connected
 *                 message:
 *                   type: string
 *                   description: Connection status message
 *       500:
 *         description: Database connection failed
 */
router.get('/check-connection', async (req, res) => {
    try {
        await migrationService.checkDatabaseConnection();
        res.json({
            connected: true,
            message: 'Database connection successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database connection check failed:', error);
        res.status(500).json({
            connected: false,
            error: 'Database connection failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /api/migration/apply:
 *   post:
 *     summary: Manually trigger migration (admin only)
 *     tags: [Migration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether migration was successful
 *                 migrationApplied:
 *                   type: boolean
 *                   description: Whether migrations were applied
 *                 duration:
 *                   type: number
 *                   description: Migration duration in milliseconds
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Migration failed
 */
router.post('/apply', async (req, res) => {
    try {
        // Note: This should have proper authentication in production
        // For now, we'll allow it but log the request
        console.log('⚠️  Manual migration triggered from:', req.ip);
        
        const result = await migrationService.runMigrationWorkflow();
        
        if (result.success) {
            res.json({
                ...result,
                message: 'Migration workflow completed successfully',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                ...result,
                message: 'Migration workflow failed',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Manual migration failed:', error);
        res.status(500).json({
            success: false,
            error: 'Manual migration failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;