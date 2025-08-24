const express = require("express");
const { PrismaClient } = require("../generated/prisma");

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Health check for server and database
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check server and database health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server and database are healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 server:
 *                   type: string
 *                   example: "✅ UP"
 *                 database:
 *                   type: string
 *                   example: "✅ Connected"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server is up but database connection failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 server:
 *                   type: string
 *                   example: "✅ UP"
 *                 database:
 *                   type: string
 *                   example: "❌ Down"
 *                 error:
 *                   type: string
 *                   example: "Database connection error"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get("/", async (req, res) => {
    try {
        // Try a simple DB query
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            server: "✅ UP",
            database: "✅ Connected",
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({
            server: "✅ UP",
            database: "❌ Down",
            error: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

module.exports = router;