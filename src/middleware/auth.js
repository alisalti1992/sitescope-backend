const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Authentication Middleware for Bearer Token validation
 * 
 * This middleware:
 * 1. Extracts Bearer token from Authorization header
 * 2. Validates JWT token
 * 3. Checks if token exists in database and is active
 * 4. Updates last used timestamp
 * 5. Attaches user information to request object
 * 
 * Usage:
 *   - Apply to routes that require authentication
 *   - User info available as req.user
 *   - Token info available as req.token
 */

/**
 * Main authentication middleware
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Check if user management is enabled
    if (process.env.FEATURE_USER_MANAGEMENT !== 'true') {
      console.log('⚠️ User management is disabled, skipping authentication');
      return next();
    }

    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Please provide a valid Bearer token in the Authorization header'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'Your session has expired. Please login again.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'The provided token is invalid.'
        });
      } else {
        return res.status(401).json({ 
          error: 'Token verification failed',
          message: 'Unable to verify the provided token.'
        });
      }
    }

    // Find token in database
    const apiToken = await prisma.apiToken.findUnique({
      where: { token },
      include: { 
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true
          }
        }
      }
    });

    if (!apiToken) {
      return res.status(401).json({ 
        error: 'Token not found',
        message: 'The provided token is not recognized.'
      });
    }

    if (!apiToken.isActive) {
      return res.status(401).json({ 
        error: 'Token inactive',
        message: 'This token has been deactivated.'
      });
    }

    if (!apiToken.user.isActive) {
      return res.status(401).json({ 
        error: 'User inactive',
        message: 'Your account has been deactivated.'
      });
    }

    // Check token expiration (if set)
    if (apiToken.expiresAt && new Date() > apiToken.expiresAt) {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'This token has expired.'
      });
    }

    // Update last used timestamp
    try {
      await prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() }
      });
    } catch (updateError) {
      console.warn('Failed to update token last used timestamp:', updateError.message);
    }

    // Attach user and token info to request
    req.user = apiToken.user;
    req.token = {
      id: apiToken.id,
      name: apiToken.name,
      expiresAt: apiToken.expiresAt
    };

    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      message: 'An error occurred during authentication.'
    });
  }
};

/**
 * Optional authentication middleware
 * Same as authenticateToken but doesn't fail if no token provided
 * Useful for endpoints that work both with and without authentication
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  // If no token provided, continue without authentication
  if (!token) {
    return next();
  }

  // If token provided, use full authentication
  return authenticateToken(req, res, next);
};

/**
 * Middleware to require admin role
 * Must be used after authenticateToken
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be authenticated to access this resource.'
    });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'You must be an administrator to access this resource.'
    });
  }

  next();
};

/**
 * Middleware to require standard user role or higher
 * Must be used after authenticateToken
 */
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be authenticated to access this resource.'
    });
  }

  if (!['ADMIN', 'STANDARD'].includes(req.user.role)) {
    return res.status(403).json({ 
      error: 'User access required',
      message: 'You must have user privileges to access this resource.'
    });
  }

  next();
};

/**
 * Generate a new JWT token for a user
 */
const generateToken = (user, tokenName = null) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const options = {};
  if (process.env.TOKEN_EXPIRY) {
    options.expiresIn = process.env.TOKEN_EXPIRY;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

/**
 * Create and store a new API token for a user
 */
const createApiToken = async (userId, tokenName = null, expiresAt = null) => {
  try {
    // Get user info for token generation
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate JWT
    const jwtToken = generateToken(user, tokenName);

    // If no expiry provided but TOKEN_EXPIRY is set, calculate expiry
    if (!expiresAt && process.env.TOKEN_EXPIRY) {
      const expiry = process.env.TOKEN_EXPIRY;
      const match = expiry.match(/^(\d+)([smhd])$/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        expiresAt = new Date(Date.now() + value * multiplier[unit]);
      }
    }

    // Store token in database
    const apiToken = await prisma.apiToken.create({
      data: {
        userId,
        token: jwtToken,
        name: tokenName,
        expiresAt,
        lastUsedAt: new Date()
      }
    });

    return {
      token: jwtToken,
      id: apiToken.id,
      name: apiToken.name,
      expiresAt: apiToken.expiresAt
    };

  } catch (error) {
    console.error('Error creating API token:', error);
    throw error;
  }
};

/**
 * Revoke an API token
 */
const revokeToken = async (tokenId, userId = null) => {
  try {
    const whereClause = { id: tokenId };
    if (userId) {
      whereClause.userId = userId; // Ensure user can only revoke their own tokens
    }

    await prisma.apiToken.update({
      where: whereClause,
      data: { isActive: false }
    });

    return true;
  } catch (error) {
    console.error('Error revoking token:', error);
    return false;
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireUser,
  generateToken,
  createApiToken,
  revokeToken
};