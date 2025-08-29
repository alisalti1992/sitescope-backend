const express = require('express');
const UserService = require('../services/userService');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');

const router = express.Router();
const userService = new UserService();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     description: Retrieve a paginated list of all users. Only administrators can access this endpoint.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const result = await userService.getAllUsers(page, limit);

    res.json(result);

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Get detailed information about a specific user. Admins can view any user, standard users can only view their own profile.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
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
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authenticateToken, requireUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Standard users can only view their own profile
    if (req.user.role !== 'ADMIN' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await userService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      },
      tokens: user.tokens 
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (Admin only)
 *     description: Update user information. Only administrators can update users.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               role:
 *                 type: string
 *                 enum: [ADMIN, STANDARD]
 *                 example: "STANDARD"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User updated successfully"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const updates = req.body;

    const updatedUser = await userService.updateUser(userId, updates);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    if (error.message.includes('Email address is already in use') || 
        error.message.includes('Invalid role')) {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.code === 'P2025') { // Prisma record not found
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     description: Delete a user account. Only administrators can delete users. Cannot delete own account or last admin.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User deleted successfully"
 *       400:
 *         description: Cannot delete (self-deletion or last admin)
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    await userService.deleteUser(userId, req.user.id);

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    if (error.message.includes('You cannot delete your own account') || 
        error.message.includes('Cannot delete the last admin user')) {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.code === 'P2025') { // Prisma record not found
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /api/users/{id}/tokens:
 *   get:
 *     summary: Get user's tokens (Admin only)
 *     description: Get all active API tokens for a specific user. Only administrators can access this endpoint.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
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
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id/tokens', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Verify user exists
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tokens = await userService.getUserTokens(userId);

    res.json({ tokens });

  } catch (error) {
    console.error('Get user tokens error:', error);
    res.status(500).json({ error: 'Failed to get user tokens' });
  }
});

/**
 * @swagger
 * /api/users/{id}/tokens/{tokenId}:
 *   delete:
 *     summary: Revoke user's token (Admin only)
 *     description: Revoke a specific API token for a user. Only administrators can access this endpoint.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Token ID
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
 *         description: Invalid user or token ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User or token not found
 *       500:
 *         description: Server error
 */
router.delete('/:id/tokens/:tokenId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const tokenId = parseInt(req.params.tokenId);

    if (isNaN(userId) || isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid user or token ID' });
    }

    // Verify user exists
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const success = await userService.revokeUserToken(tokenId, userId);

    if (!success) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json({ message: 'Token revoked successfully' });

  } catch (error) {
    console.error('Revoke user token error:', error);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

module.exports = router;