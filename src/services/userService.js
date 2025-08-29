const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { createApiToken } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * User Management Service
 * 
 * Handles all user-related operations including:
 * - User authentication (login/logout)
 * - User creation and management
 * - Password hashing and verification
 * - Role-based access control
 * - Default admin user initialization
 */
class UserService {
  constructor() {
    this.saltRounds = 12; // bcrypt salt rounds for password hashing
  }

  /**
   * Initialize the user system
   * Creates default admin user if no users exist
   */
  async initialize() {
    if (process.env.FEATURE_USER_MANAGEMENT !== 'true') {
      console.log('📧 User management is disabled');
      return;
    }

    try {
      // Check if any users exist
      const userCount = await prisma.user.count();
      
      if (userCount === 0) {
        console.log('👤 No users found, creating default admin user...');
        await this.createDefaultAdmin();
      } else {
        console.log(`👥 User management initialized with ${userCount} user(s)`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize user system:', error.message);
    }
  }

  /**
   * Create default admin user from environment variables
   */
  async createDefaultAdmin() {
    try {
      const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@sitescope.com';
      const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const name = 'Administrator';

      const admin = await this.createUser({
        name,
        email,
        password,
        role: 'ADMIN'
      });

      console.log(`✅ Default admin user created: ${email}`);
      console.log(`⚠️  Please change the default password after first login!`);
      
      return admin;
    } catch (error) {
      console.error('❌ Failed to create default admin user:', error.message);
      throw error;
    }
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Create a new user
   */
  async createUser({ name, email, password, role = 'STANDARD' }) {
    try {
      // Validate input
      if (!name || !email || !password) {
        throw new Error('Name, email, and password are required');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Check if email is already in use
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        throw new Error('Email address is already in use');
      }

      // Validate role
      if (!['ADMIN', 'STANDARD'].includes(role)) {
        throw new Error('Invalid role. Must be ADMIN or STANDARD');
      }

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          role: role,
          isActive: true
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true
        }
      });

      console.log(`✅ User created: ${user.email} (${user.role})`);
      return user;

    } catch (error) {
      console.error('❌ Failed to create user:', error.message);
      throw error;
    }
  }

  /**
   * Authenticate user and create session token
   */
  async login(email, password, tokenName = 'Web Login') {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() }
      });

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Update last login timestamp
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Create API token
      const tokenData = await createApiToken(user.id, tokenName);

      // Return user info and token
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLoginAt: new Date()
        },
        token: tokenData.token,
        tokenId: tokenData.id,
        expiresAt: tokenData.expiresAt
      };

    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          tokens: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              expiresAt: true,
              createdAt: true,
              lastUsedAt: true
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return user;
    } catch (error) {
      console.error('❌ Failed to get user:', error.message);
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true
        }
      });

      return user;
    } catch (error) {
      console.error('❌ Failed to get user by email:', error.message);
      throw error;
    }
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            _count: {
              select: { tokens: { where: { isActive: true } } }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.user.count()
      ]);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ Failed to get users:', error.message);
      throw error;
    }
  }

  /**
   * Update user information
   */
  async updateUser(id, updates) {
    try {
      const allowedFields = ['name', 'email', 'role', 'isActive'];
      const filteredUpdates = {};

      // Filter allowed fields
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = value;
        }
      }

      // Validate email if provided
      if (filteredUpdates.email) {
        filteredUpdates.email = filteredUpdates.email.toLowerCase().trim();
        
        const existingUser = await prisma.user.findFirst({
          where: {
            email: filteredUpdates.email,
            id: { not: id }
          }
        });

        if (existingUser) {
          throw new Error('Email address is already in use');
        }
      }

      // Validate role if provided
      if (filteredUpdates.role && !['ADMIN', 'STANDARD'].includes(filteredUpdates.role)) {
        throw new Error('Invalid role. Must be ADMIN or STANDARD');
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: filteredUpdates,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true
        }
      });

      console.log(`✅ User updated: ${updatedUser.email}`);
      return updatedUser;

    } catch (error) {
      console.error('❌ Failed to update user:', error.message);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(id, currentPassword, newPassword) {
    try {
      if (!currentPassword || !newPassword) {
        throw new Error('Current password and new password are required');
      }

      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }

      // Get current user with password
      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword }
      });

      console.log(`✅ Password changed for user: ${user.email}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to change password:', error.message);
      throw error;
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(id, adminId) {
    try {
      // Prevent self-deletion
      if (id === adminId) {
        throw new Error('You cannot delete your own account');
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Prevent deletion of last admin
      if (user.role === 'ADMIN') {
        const adminCount = await prisma.user.count({
          where: { role: 'ADMIN', isActive: true }
        });

        if (adminCount <= 1) {
          throw new Error('Cannot delete the last admin user');
        }
      }

      // Delete user (will cascade delete tokens)
      await prisma.user.delete({
        where: { id }
      });

      console.log(`✅ User deleted: ${user.email}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to delete user:', error.message);
      throw error;
    }
  }

  /**
   * Get user's active tokens
   */
  async getUserTokens(userId) {
    try {
      const tokens = await prisma.apiToken.findMany({
        where: {
          userId,
          isActive: true
        },
        select: {
          id: true,
          name: true,
          expiresAt: true,
          createdAt: true,
          lastUsedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return tokens;
    } catch (error) {
      console.error('❌ Failed to get user tokens:', error.message);
      throw error;
    }
  }

  /**
   * Revoke user token
   */
  async revokeUserToken(tokenId, userId) {
    try {
      const token = await prisma.apiToken.findFirst({
        where: {
          id: tokenId,
          userId: userId
        }
      });

      if (!token) {
        throw new Error('Token not found');
      }

      await prisma.apiToken.update({
        where: { id: tokenId },
        data: { isActive: false }
      });

      console.log(`✅ Token revoked: ${tokenId}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to revoke token:', error.message);
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens() {
    try {
      const result = await prisma.apiToken.updateMany({
        where: {
          expiresAt: { lt: new Date() },
          isActive: true
        },
        data: { isActive: false }
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} expired token(s)`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup expired tokens:', error.message);
      return 0;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await prisma.$disconnect();
  }
}

module.exports = UserService;