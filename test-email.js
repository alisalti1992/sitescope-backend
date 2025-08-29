#!/usr/bin/env node

/**
 * Email Service Test Script
 * 
 * This script tests the email functionality by:
 * 1. Loading environment variables
 * 2. Testing SMTP configuration
 * 3. Sending a test email report (if a job ID is provided)
 * 
 * Usage:
 *   node test-email.js                    # Test SMTP configuration only
 *   node test-email.js <jobId>           # Test sending email for specific job
 *   node test-email.js <jobId> <email>   # Test sending email to specific recipient
 */

require('dotenv').config();
const EmailService = require('./src/services/emailService');

async function testEmailService() {
  console.log('🧪 Testing Email Service...\n');
  
  const emailService = new EmailService();
  
  try {
    // 1. Test SMTP configuration
    console.log('📧 Testing SMTP configuration...');
    const configValid = await emailService.testEmailConfiguration();
    
    if (!configValid) {
      console.log('❌ SMTP configuration is invalid or email service is disabled');
      console.log('\n💡 To enable email reports, ensure these environment variables are set:');
      console.log('   FEATURE_EMAIL_REPORTS=true');
      console.log('   SMTP_HOST=your.smtp.server.com');
      console.log('   SMTP_PORT=587');
      console.log('   SMTP_USER=your@email.com');
      console.log('   SMTP_PASS=yourpassword');
      console.log('   SMTP_FROM="Your Name <your@email.com>"');
      console.log('   SMTP_BCC=recipient@example.com');
      console.log('   FRONTEND_URL=http://localhost:3000');
      return;
    }
    
    console.log('✅ SMTP configuration is valid!\n');
    
    // 2. Check if job ID provided for testing
    const jobId = process.argv[2];
    const testRecipient = process.argv[3];
    
    if (!jobId) {
      console.log('✅ Email service is properly configured and ready to use.');
      console.log('💡 To test sending an email report, run: node test-email.js <jobId>');
      return;
    }
    
    console.log(`📧 Testing email report for job ID: ${jobId}`);
    if (testRecipient) {
      console.log(`📬 Sending to: ${testRecipient}`);
    }
    
    // 3. Send test email
    const result = await emailService.sendJobCompletionReport(parseInt(jobId), testRecipient);
    
    if (result.success) {
      console.log(`✅ Email sent successfully to: ${result.recipient}`);
    } else {
      console.log(`❌ Failed to send email: ${result.error || result.reason}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await emailService.close();
  }
}

// Show current email configuration (without sensitive data)
function showCurrentConfig() {
  console.log('🔧 Current Email Configuration:');
  console.log(`   Feature Enabled: ${process.env.FEATURE_EMAIL_REPORTS}`);
  console.log(`   SMTP Host: ${process.env.SMTP_HOST || 'Not set'}`);
  console.log(`   SMTP Port: ${process.env.SMTP_PORT || 'Not set'}`);
  console.log(`   SMTP User: ${process.env.SMTP_USER || 'Not set'}`);
  console.log(`   SMTP Secure: ${process.env.SMTP_SECURE || 'false'}`);
  console.log(`   From Address: ${process.env.SMTP_FROM || 'Not set'}`);
  console.log(`   Default Recipient: ${process.env.SMTP_BCC || 'Not set'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
  console.log('');
}

// Main execution
if (require.main === module) {
  showCurrentConfig();
  testEmailService().catch(console.error);
}