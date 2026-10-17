import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { validateRequest } from '../../utils/validation';
import {
  agentDocBodySchema,
  agentDocUpdateSchema,
  createAgentDocHandler,
  deleteAgentDocHandler,
  listAgentDocsHandler,
  updateAgentDocHandler,
} from './agentDocsCrud';

const router = Router({ mergeParams: true });

router.get('/:id/agent-skills', authenticateToken, (req, res) =>
  listAgentDocsHandler(req, res, 'organization', 'skills')
);
router.post(
  '/:id/agent-skills',
  authenticateToken,
  validateRequest(agentDocBodySchema),
  (req, res) => createAgentDocHandler(req, res, 'organization', 'skills')
);
router.put(
  '/:id/agent-skills/:docId',
  authenticateToken,
  validateRequest(agentDocUpdateSchema),
  (req, res) => updateAgentDocHandler(req, res, 'organization', 'skills')
);
router.delete('/:id/agent-skills/:docId', authenticateToken, (req, res) =>
  deleteAgentDocHandler(req, res, 'organization', 'skills')
);

router.get('/:id/agent-rules', authenticateToken, (req, res) =>
  listAgentDocsHandler(req, res, 'organization', 'rules')
);
router.post(
  '/:id/agent-rules',
  authenticateToken,
  validateRequest(agentDocBodySchema),
  (req, res) => createAgentDocHandler(req, res, 'organization', 'rules')
);
router.put(
  '/:id/agent-rules/:docId',
  authenticateToken,
  validateRequest(agentDocUpdateSchema),
  (req, res) => updateAgentDocHandler(req, res, 'organization', 'rules')
);
router.delete('/:id/agent-rules/:docId', authenticateToken, (req, res) =>
  deleteAgentDocHandler(req, res, 'organization', 'rules')
);

export default router;
