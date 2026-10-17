import { Router, Response } from 'express';
import { z } from 'zod';
import { pool, ResultSetHeader, RowDataPacket } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { validateRequest } from '../../utils/validation';
import logger from '../../utils/logger';
import { getUserMcpWritesEnabled } from './scopeService';

const router = Router();

const patchPreferencesSchema = z.object({
  mcpWritesEnabled: z.union([z.boolean(), z.coerce.number()]),
});

router.get('/preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (req.user?.customerId) {
      return res.status(403).json({ success: false, message: 'MCP is not available for customer portal users' });
    }
    const mcpWritesEnabled = await getUserMcpWritesEnabled(userId);
    return res.json({
      success: true,
      data: { mcpWritesEnabled },
    });
  } catch (error) {
    logger.error('Failed to load MCP preferences', error);
    return res.status(500).json({ success: false, message: 'Failed to load MCP preferences' });
  }
});

router.patch(
  '/preferences',
  authenticateToken,
  validateRequest(patchPreferencesSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (req.user?.customerId) {
        return res.status(403).json({ success: false, message: 'MCP is not available for customer portal users' });
      }
      const enabled = Boolean(req.body.mcpWritesEnabled);
      await pool.execute<ResultSetHeader>(
        'UPDATE Users SET McpWritesEnabled = ? WHERE Id = ?',
        [enabled ? 1 : 0, userId]
      );
      return res.json({
        success: true,
        data: { mcpWritesEnabled: enabled },
        message: 'MCP preferences updated',
      });
    } catch (error) {
      logger.error('Failed to update MCP preferences', error);
      return res.status(500).json({ success: false, message: 'Failed to update MCP preferences' });
    }
  }
);

/** Lightweight health for MCP clients */
router.get('/health', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.customerId) {
      return res.status(403).json({ success: false, message: 'MCP is not available for customer portal users' });
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE Id = ?',
      [req.user?.userId]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    logger.error('MCP health failed', error);
    return res.status(500).json({ success: false, message: 'MCP health failed' });
  }
});

export default router;
