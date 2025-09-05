# Email Report Setup Guide

The SMTP integration and email report delivery feature allows SiteScope to automatically send email notifications when crawl jobs are completed.

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```env
# Feature Toggle - Enable/disable email reports
FEATURE_EMAIL_REPORTS=true

# SMTP Configuration
SMTP_HOST=smtp.gmail.com              # Your SMTP server
SMTP_PORT=587                         # SMTP port (587 for TLS, 465 for SSL)
SMTP_USER=your.email@gmail.com        # SMTP username
SMTP_PASS=your-app-password           # SMTP password or app password
SMTP_SECURE=false                     # true for SSL (port 465), false for TLS (port 587)
SMTP_FROM="SiteScope <your.email@gmail.com>"  # From address
SMTP_BCC="recipient@example.com"      # Default recipient (optional)

# Frontend URL for report links
FRONTEND_URL=http://localhost:3000    # Your frontend URL
```

### Common SMTP Providers

#### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your-app-password  # Use App Password, not regular password
SMTP_SECURE=false
```

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_SECURE=false
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
SMTP_SECURE=false
```

## Testing Email Configuration

### 1. Test SMTP Configuration
```bash
node test-email.js
```

### 2. Test Email Report for Specific Job
```bash
node test-email.js <jobId>
```

### 3. Test Email to Specific Recipient
```bash
node test-email.js <jobId> test@example.com
```

### 4. Test via API Endpoint
```bash
# Send email report for job 123
curl -X POST http://localhost:5000/jobs/123/send-email-report \
  -H "Content-Type: application/json" \
  -d '{"recipient": "test@example.com"}'
```

## How It Works

1. **Automatic Delivery**: When a crawl job completes, the system automatically sends an email report if `FEATURE_EMAIL_REPORTS=true`

2. **Report Content**: 
   - Job summary with key statistics
   - Top performing pages
   - Link to view full report on frontend
   - Professional HTML design with Move Ahead Media branding

3. **Error Handling**: 
   - Automatic retry with exponential backoff
   - Detailed logging for troubleshooting
   - Graceful degradation if email fails

4. **Manual Triggers**: 
   - API endpoint for manual email sending
   - Test script for configuration validation

## Email Report Contents

The email report includes:

- **Summary Statistics**:
  - Pages crawled
  - Total words analyzed
  - Average response time
  - Indexable/non-indexable pages

- **Top Performing Pages**: 
  - Based on link score algorithm
  - Page titles and URLs

- **Direct Link**: 
  - Button to view full report in frontend
  - Uses `FRONTEND_URL` configuration

## Troubleshooting

### Common Issues

1. **"Email service not configured"**
   - Ensure all required SMTP environment variables are set
   - Check that `FEATURE_EMAIL_REPORTS=true`

2. **"SMTP authentication failed"**
   - Verify SMTP credentials
   - For Gmail, use App Passwords instead of regular password
   - Check if 2FA is enabled and app passwords are required

3. **"Connection timeout"**
   - Verify SMTP host and port
   - Check firewall/network restrictions
   - Try different SMTP ports (587 vs 465)

4. **"Job not found"**
   - Ensure the job ID exists and has status 'completed'
   - Only completed jobs can generate email reports

### Enable Debug Logging

The email service provides detailed console logging for troubleshooting:

- `📧` - Email service operations
- `✅` - Success messages  
- `❌` - Error messages
- `⏳` - Retry attempts

## Security Best Practices

1. **Use App Passwords**: For Gmail and other providers, use app-specific passwords
2. **Environment Variables**: Never commit SMTP credentials to version control
3. **TLS/SSL**: Always use encrypted connections (`SMTP_SECURE=true` for port 465)
4. **Recipient Validation**: Validate email addresses before sending
5. **Rate Limiting**: Be mindful of SMTP provider rate limits

## API Documentation

The email functionality is also available via REST API and documented in Swagger:

- **Endpoint**: `POST /jobs/{id}/send-email-report`
- **Purpose**: Manually trigger email report for completed job
- **Parameters**: 
  - `id` (path): Job ID
  - `recipient` (body, optional): Override default recipient

Visit `/api-docs` to see full API documentation.