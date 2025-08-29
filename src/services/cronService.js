const cron = require('node-cron');
const EmailVerificationService = require('./emailVerificationService');

/**
 * Cron Service for scheduling background tasks
 */
class CronService {
  constructor() {
    this.emailVerificationService = new EmailVerificationService();
  }

  /**
   * Start all cron jobs
   */
  start() {
    console.log('⏰ Starting cron service...');

    // Schedule cleanup of expired verification codes (e.g., every hour)
    cron.schedule('0 * * * *', async () => {
      console.log('Running scheduled task: cleanupExpiredCodes');
      try {
        const count = await this.emailVerificationService.cleanupExpiredCodes();
        if (count > 0) {
          console.log(`✅ Successfully cleaned up ${count} expired verification codes.`);
        }
      } catch (error) {
        console.error('❌ Error during scheduled cleanup of expired codes:', error);
      }
    });

    console.log('✅ Cron service started');
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    cron.getTasks().forEach(task => task.stop());
    console.log('🛑 Cron service stopped');
  }
}

module.exports = CronService;
