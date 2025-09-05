# Database Migration Guide

SiteScope Backend now includes **automatic database migration** functionality that ensures your database schema is always up-to-date when the server starts.

## 🚀 How It Works

### Automatic Migration on Startup
When you start the server (locally or in Docker), the system automatically:

1. **Checks database connection** - Ensures the database is accessible
2. **Generates Prisma client** - Updates the client with latest schema
3. **Detects setup type** - Determines if this is first-time setup or existing database
4. **Applies schema changes** - Uses appropriate strategy based on setup type:
   - **First-time setup**: Uses `prisma db push` to create initial schema
   - **Existing database**: Uses `prisma migrate deploy` to apply pending migrations
5. **Starts the server** - Only proceeds if schema sync succeeds

### Migration Strategy Selection
The system intelligently chooses the appropriate migration strategy:

- **First-time Setup**: Uses `prisma db push` to create initial schema without migration history
- **Development** (`NODE_ENV=development`): Uses `prisma migrate deploy` for pending migrations
- **Production** (`NODE_ENV=production`): Uses `prisma migrate deploy` for safety

## ⚙️ Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Enable/disable automatic migrations (default: true)
AUTO_MIGRATE=true

# Migration timeout in milliseconds (default: 60000 = 1 minute)  
MIGRATION_TIMEOUT=60000

# Optional: Skip seeding during auto-migration
SKIP_SEED=1
```

### Disabling Auto-Migration
Set `AUTO_MIGRATE=false` to disable automatic migrations if you prefer manual control.

## 🛠️ Available Commands

### NPM Scripts
```bash
# Development with auto-migration
npm run dev

# Production start with auto-migration  
npm start

# Manual migration commands
npm run prisma:deploy      # Apply pending migrations (production-safe)
npm run prisma:status      # Check migration status
npm run migrate           # Run migrations + generate client
npm run prisma:generate   # Generate Prisma client only
```

### Docker Commands
```bash
# Start with auto-migration enabled
npm run docker:dev

# Check migration status inside container
npm run docker:shell
npx prisma migrate status
```

## 🔍 Monitoring & Health Checks

### API Endpoints

**Check Migration Status**
```bash
curl http://localhost:5000/api/migration/status
```

**Check Database Connection**  
```bash
curl http://localhost:5000/api/migration/check-connection
```

**Manually Trigger Migration** (if needed)
```bash
curl -X POST http://localhost:5000/api/migration/apply
```

### Response Example
```json
{
  "status": "Database is up to date",
  "isUpToDate": true,
  "hasPendingMigrations": false,
  "autoMigrateEnabled": true,
  "environment": "development",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## 🐳 Docker Deployment

### Development
The existing `Dockerfile` automatically handles migrations on startup.

### Production
Use the production-optimized `Dockerfile.production`:

```bash
# Build production image
docker build -f Dockerfile.production -t sitescope-backend:prod .

# Run with auto-migration enabled (default)
docker run -d -p 5000:5000 sitescope-backend:prod

# Run with auto-migration disabled  
docker run -d -p 5000:5000 -e AUTO_MIGRATE=false sitescope-backend:prod
```

## 🔄 CI/CD Integration

### GitHub Actions
The included `.github/workflows/deploy.yml` provides:

- **Migration Testing** - Tests migrations against a clean database
- **Deployment Safety** - Ensures migrations work before deploying
- **Environment Flexibility** - Works with different deployment targets

### Manual CI/CD
For custom CI/CD pipelines, ensure:

1. **Test migrations** against a fresh database
2. **Set appropriate environment variables**
3. **Allow sufficient timeout** for migration process
4. **Monitor migration status** via health check endpoints

## 🚨 Error Handling

### Migration Failures
- **Development**: Server continues with warning, allows manual intervention
- **Production**: Server exits with error code 1, prevents startup with broken schema

### Common Issues & Solutions

**"Migration timeout"**
- Increase `MIGRATION_TIMEOUT` value
- Check database connectivity and performance

**"Database connection failed"**
- Verify `DATABASE_URL` is correct
- Ensure database server is running
- Check network connectivity

**"Migration conflicts"**  
- Review and resolve schema conflicts
- Use `npx prisma migrate resolve` if needed
- Check migration history

### Recovery Strategies

**Reset Development Database**
```bash
npm run prisma:migrate  # Resets and applies all migrations
```

**Manual Production Recovery**
```bash
# Check status
npx prisma migrate status

# Resolve conflicts (if any)
npx prisma migrate resolve --applied <migration-name>

# Apply pending
npx prisma migrate deploy
```

## 📊 Best Practices

### Development Workflow
1. **Make schema changes** in `prisma/schema.prisma`
2. **Create migration** with `npx prisma migrate dev --name descriptive-name`
3. **Test locally** - auto-migration handles the rest
4. **Commit migration files** to version control

### Production Deployment
1. **Test migrations** in staging environment first
2. **Backup database** before major migrations
3. **Monitor migration endpoints** after deployment
4. **Keep migration timeouts** appropriate for data size

### Schema Changes
- **Always review** generated migration SQL
- **Test with production data volume** in staging
- **Use descriptive migration names**
- **Document breaking changes** in migration comments

## 🔧 Troubleshooting

### Debug Migration Issues
```bash
# Check detailed migration status
npx prisma migrate status

# View migration history
ls prisma/migrations/

# Test database connection
npx prisma db pull

# Regenerate client
npx prisma generate
```

### Logs & Monitoring
The server provides detailed logging for all migration operations:

- `🔄` - Migration process starting
- `✅` - Migration completed successfully  
- `❌` - Migration failed with error details
- `⚠️` - Warnings or fallback actions

## 📞 Support

For migration-related issues:

1. **Check server logs** for detailed error messages
2. **Use migration status API** for current state
3. **Review Prisma documentation** for advanced scenarios
4. **Test in development environment** before production changes

The automatic migration system is designed to make database management seamless while maintaining safety and reliability across all environments.