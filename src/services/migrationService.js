const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Migration Service
 * Handles automatic Prisma database migrations on deployment
 */
class MigrationService {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.autoMigrateEnabled = process.env.AUTO_MIGRATE !== 'false'; // Enabled by default
        this.migrationTimeout = parseInt(process.env.MIGRATION_TIMEOUT) || 60000; // 60 seconds default
    }

    /**
     * Apply database migrations automatically
     * Uses different strategies for development vs production
     */
    async applyMigrations() {
        if (!this.autoMigrateEnabled) {
            console.log('🚫 Auto-migration is disabled (AUTO_MIGRATE=false)');
            return false;
        }

        console.log('🔄 Starting database migration...');
        
        try {
            // Check if this is a first-time setup (no migrations exist)
            const isFirstTime = await this.isFirstTimeSetup();
            
            if (isFirstTime) {
                console.log('🆕 First-time setup detected, using db push...');
                return await this.runFirstTimeSetup();
            }
            
            if (this.isProduction) {
                return await this.runProductionMigration();
            } else {
                return await this.runDevelopmentMigration();
            }
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            
            // In production, this should fail fast
            if (this.isProduction) {
                throw new Error(`Critical: Database migration failed in production - ${error.message}`);
            }
            
            // In development, we can be more forgiving
            console.warn('⚠️  Migration failed in development mode, continuing with existing schema...');
            return false;
        }
    }

    /**
     * Production migration using prisma migrate deploy
     * Safe for production - only applies pending migrations
     */
    async runProductionMigration() {
        console.log('🏭 Running production migration (prisma migrate deploy)...');
        
        const command = 'npx prisma migrate deploy';
        const { stdout, stderr } = await execAsync(command, {
            timeout: this.migrationTimeout,
            cwd: process.cwd()
        });

        // Filter out informational messages that aren't actual errors
        const filteredStderr = stderr ? stderr
            .split('\n')
            .filter(line => !line.includes('Environment variables loaded from'))
            .filter(line => !line.includes('warnings'))
            .filter(line => !line.includes('injecting env'))
            .filter(line => line.trim().length > 0)
            .join('\n') : '';

        if (filteredStderr) {
            throw new Error(`Migration stderr: ${filteredStderr}`);
        }

        console.log('✅ Production migration completed successfully');
        if (stdout) {
            console.log('Migration output:', stdout);
        }
        
        return true;
    }

    /**
     * Development migration using prisma migrate dev
     * More flexible for development - creates and applies migrations
     */
    async runDevelopmentMigration() {
        console.log('🛠️  Running development migration (prisma migrate dev)...');
        
        // First, try to apply existing migrations without creating new ones
        try {
            // Try migrate deploy first as it's non-interactive
            const command = 'npx prisma migrate deploy';
            const { stdout, stderr } = await execAsync(command, {
                timeout: this.migrationTimeout,
                cwd: process.cwd(),
                env: { ...process.env, SKIP_SEED: '1' } // Skip seeding in auto-migration
            });

            // Filter out informational messages that aren't actual errors
            const filteredStderr = stderr ? stderr
                .split('\n')
                .filter(line => !line.includes('Environment variables loaded from'))
                .filter(line => !line.includes('warnings'))
                .filter(line => !line.includes('injecting env'))
                .filter(line => line.trim().length > 0)
                .join('\n') : '';

            if (filteredStderr) {
                console.warn('Migration warnings:', filteredStderr);
            }

            console.log('✅ Development migration completed successfully');
            if (stdout) {
                console.log('Migration output:', stdout);
            }
            
            return true;
        } catch (error) {
            // If migrate dev fails, try migrate deploy as fallback
            console.log('⚠️  migrate dev failed, trying migrate deploy as fallback...');
            return await this.runProductionMigration();
        }
    }

    /**
     * Check if this is a first-time setup
     * Returns true if no migration table exists or no migrations have been applied
     */
    async isFirstTimeSetup() {
        try {
            // First, check if we can connect to the database and if _prisma_migrations table exists
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            
            try {
                // Try to query the _prisma_migrations table
                await prisma.$queryRaw`SELECT COUNT(*) FROM "_prisma_migrations"`;
                await prisma.$disconnect();
                
                // If we can query the table, it's not first-time setup
                return false;
            } catch (error) {
                await prisma.$disconnect();
                
                // If the table doesn't exist, it's first-time setup
                if (error.message.includes('_prisma_migrations') && 
                    (error.message.includes('does not exist') || error.message.includes('relation') && error.message.includes('does not exist'))) {
                    return true;
                }
                
                // For other errors, fall back to migrate status check
                throw error;
            }
        } catch (error) {
            // Fall back to checking migrate status
            try {
                const { stdout, stderr } = await execAsync('npx prisma migrate status', {
                    timeout: 10000,
                    cwd: process.cwd()
                });

                // If migration status shows "No migration found" or database doesn't exist
                if (stdout.includes('No migration found') || 
                    stdout.includes('database does not exist') ||
                    stderr.includes('database does not exist') ||
                    (stdout.includes('_prisma_migrations') && stdout.includes('does not exist'))) {
                    return true;
                }

                return false;
            } catch (migrationError) {
                // If we can't check migration status, likely a fresh database
                console.log('🔍 Could not check migration status, assuming first-time setup');
                return true;
            }
        }
    }

    /**
     * First-time setup - handles both empty databases and databases with schema but no migration history
     */
    async runFirstTimeSetup() {
        console.log('🔧 Running first-time database setup...');
        
        try {
            // First, try to push the current schema
            console.log('📤 Pushing current schema to database...');
            const pushCommand = 'npx prisma db push --skip-generate';
            const { stdout: pushStdout, stderr: pushStderr } = await execAsync(pushCommand, {
                timeout: this.migrationTimeout,
                cwd: process.cwd()
            });

            console.log('✅ Schema pushed successfully');
            if (pushStdout) {
                console.log('Push output:', pushStdout);
            }

            // Then, baseline the existing migrations to mark them as applied
            console.log('📋 Baselining existing migrations...');
            const baselineCommand = 'npx prisma migrate resolve --applied ""';
            
            // Get list of migration folders to baseline
            const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
            const fs = require('fs');
            
            if (fs.existsSync(migrationsDir)) {
                const migrations = fs.readdirSync(migrationsDir)
                    .filter(name => fs.statSync(path.join(migrationsDir, name)).isDirectory())
                    .sort();

                for (const migration of migrations) {
                    try {
                        console.log(`🏷️  Marking migration as applied: ${migration}`);
                        await execAsync(`npx prisma migrate resolve --applied "${migration}"`, {
                            timeout: 30000,
                            cwd: process.cwd()
                        });
                    } catch (error) {
                        console.warn(`⚠️  Could not baseline migration ${migration}:`, error.message);
                    }
                }
            }

            console.log('✅ First-time database setup completed successfully');
            return true;
            
        } catch (error) {
            console.error('❌ First-time setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Ensure Prisma client is generated
     */
    async generateClient() {
        try {
            console.log('🔧 Generating Prisma client...');
            const { stdout, stderr } = await execAsync('npx prisma generate', {
                timeout: 30000,
                cwd: process.cwd()
            });

            // Filter out informational messages that aren't actual errors
            const filteredStderr = stderr ? stderr
                .split('\n')
                .filter(line => !line.includes('Environment variables loaded from'))
                .filter(line => !line.includes('warnings'))
                .filter(line => !line.includes('injecting env'))
                .filter(line => line.trim().length > 0)
                .join('\n') : '';

            if (filteredStderr) {
                throw new Error(`Client generation stderr: ${filteredStderr}`);
            }

            console.log('✅ Prisma client generated successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to generate Prisma client:', error.message);
            throw error;
        }
    }

    /**
     * Check database connectivity
     */
    async checkDatabaseConnection() {
        try {
            console.log('🔗 Checking database connection...');
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            
            await prisma.$connect();
            await prisma.$disconnect();
            
            console.log('✅ Database connection successful');
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    /**
     * Full migration workflow
     * 1. Check database connection
     * 2. Generate Prisma client
     * 3. Apply migrations
     */
    async runMigrationWorkflow() {
        const startTime = Date.now();
        console.log('🚀 Starting migration workflow...');

        try {
            // Step 1: Check database connection
            await this.checkDatabaseConnection();

            // Step 2: Generate Prisma client
            await this.generateClient();

            // Step 3: Apply migrations
            const migrationSuccess = await this.applyMigrations();

            const duration = Date.now() - startTime;
            console.log(`✅ Migration workflow completed in ${duration}ms`);
            
            return {
                success: true,
                migrationApplied: migrationSuccess,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ Migration workflow failed after ${duration}ms:`, error.message);
            
            // Return detailed error info
            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Get migration status information
     */
    async getMigrationStatus() {
        try {
            const { stdout, stderr } = await execAsync('npx prisma migrate status', {
                timeout: 10000,
                cwd: process.cwd()
            });
            
            // Filter out informational messages from stderr
            const filteredStderr = stderr ? stderr
                .split('\n')
                .filter(line => !line.includes('Environment variables loaded from'))
                .filter(line => !line.includes('injecting env'))
                .filter(line => line.trim().length > 0)
                .join('\n') : '';
            
            return {
                status: stdout,
                hasPendingMigrations: stdout.includes('following migration have not yet been applied'),
                isUpToDate: stdout.includes('Database is up to date'),
                stderr: filteredStderr || null
            };
        } catch (error) {
            // Check if it's just informational stderr - extract stdout even from "failed" command
            if (error.stdout && error.message.includes('Environment variables loaded from')) {
                return {
                    status: error.stdout,
                    hasPendingMigrations: error.stdout.includes('following migration have not yet been applied'),
                    isUpToDate: error.stdout.includes('Database is up to date'),
                    stderr: 'Informational messages filtered'
                };
            }
            
            return {
                status: 'Error checking migration status',
                error: error.message,
                hasPendingMigrations: null,
                isUpToDate: null
            };
        }
    }
}

module.exports = MigrationService;