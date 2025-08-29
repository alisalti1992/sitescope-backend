const express = require('express');
const UserService = require('../services/userService');
const { authenticateToken, requireAdmin, revokeToken } = require('../middleware/auth');

const router = express.Router();
const userService = new UserService();

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "admin@sitescope.com"
 *         password:
 *           type: string
 *           example: "admin123"
 *         tokenName:
 *           type: string
 *           example: "Web Login"
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Login successful"
 *         user:
 *           $ref: '#/components/schemas/User'
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         tokenId:
 *           type: integer
 *           example: 1
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-01T00:00:00Z"
 *     
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: "Administrator"
 *         email:
 *           type: string
 *           format: email
 *           example: "admin@sitescope.com"
 *         role:
 *           type: string
 *           enum: [ADMIN, STANDARD]
 *           example: "ADMIN"
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *     
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           example: "John Doe"
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@example.com"
 *         password:
 *           type: string
 *           minLength: 6
 *           example: "securepassword123"
 *         role:
 *           type: string
 *           enum: [ADMIN, STANDARD]
 *           default: STANDARD
 *           example: "STANDARD"
 *   
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and receive access token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Email and password are required"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid email or password"
 *       500:
 *         description: Server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, tokenName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    const result = await userService.login(email, password, tokenName);

    res.json({
      message: 'Login successful',
      user: result.user,
      token: result.token,
      tokenId: result.tokenId,
      expiresAt: result.expiresAt
    });

  } catch (error) {
    if (error.message.includes('Invalid email or password') || 
        error.message.includes('Account is deactivated')) {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user (Admin only)
 *     description: Create a new user account. Only administrators can register new users.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User created successfully"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Email address is already in use"
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'STANDARD' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Name, email, and password are required' 
      });
    }

    const user = await userService.createUser({ name, email, password, role });

    res.status(201).json({
      message: 'User created successfully',
      user
    });

  } catch (error) {
    if (error.message.includes('Email address is already in use') || 
        error.message.includes('Password must be at least') ||
        error.message.includes('Invalid role')) {
      return res.status(400).json({ error: error.message });
    }
    
    console.error('Registration error:', error);
    res.status(500).json({ error: 'User registration failed' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Get the profile information for the currently authenticated user
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userDetails = await userService.getUserById(req.user.id);
    
    if (!userDetails) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: userDetails.id,
        name: userDetails.name,
        email: userDetails.email,
        role: userDetails.role,
        isActive: userDetails.isActive,
        createdAt: userDetails.createdAt,
        updatedAt: userDetails.updatedAt,
        lastLoginAt: userDetails.lastLoginAt
      },
      tokens: userDetails.tokens
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password
 *     description: Change the current user's password
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "oldpassword123"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required or current password incorrect
 *       500:
 *         description: Server error
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }

    await userService.changePassword(req.user.id, currentPassword, newPassword);

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    if (error.message.includes('Current password is incorrect')) {
      return res.status(401).json({ error: error.message });
    }
    
    if (error.message.includes('must be at least')) {
      return res.status(400).json({ error: error.message });
    }
    
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * @swagger
 * /api/auth/tokens:
 *   get:
 *     summary: Get user's active tokens
 *     description: Get all active API tokens for the current user
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tokens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get('/tokens', authenticateToken, async (req, res) => {
  try {
    const tokens = await userService.getUserTokens(req.user.id);
    
    res.json({ tokens });

  } catch (error) {
    console.error('Get tokens error:', error);
    res.status(500).json({ error: 'Failed to get tokens' });
  }
});

/**
 * @swagger
 * /api/auth/tokens/{tokenId}:
 *   delete:
 *     summary: Revoke API token
 *     description: Revoke (deactivate) a specific API token
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the token to revoke
 *     responses:
 *       200:
 *         description: Token revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Token revoked successfully"
 *       400:
 *         description: Invalid token ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Token not found
 *       500:
 *         description: Server error
 */
router.delete('/tokens/:tokenId', authenticateToken, async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);

    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const success = await userService.revokeUserToken(tokenId, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json({ message: 'Token revoked successfully' });

  } catch (error) {
    console.error('Revoke token error:', error);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout (revoke current token)
 *     description: Logout the current user by revoking the current API token
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logout successful"
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await revokeToken(req.token.id);
    
    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;