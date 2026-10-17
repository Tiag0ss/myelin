import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';
import {
  toolCreateTask,
  toolGetDoc,
  toolGetTask,
  toolListDocs,
  toolListMyTasks,
  toolListProjectMeta,
  toolResolveContext,
  toolUpdateTask,
  type McpToolContext,
} from './toolHandlers';

const router = Router();

const commonShape = {
  repositoryUrl: z.string().optional(),
  projectIds: z.array(z.union([z.number(), z.string()])).optional(),
  strict: z.union([z.boolean(), z.string(), z.number()]).optional(),
  allowWrite: z.union([z.boolean(), z.string(), z.number()]).optional(),
  applicationId: z.union([z.number(), z.string()]).optional(),
};

function ctxFromReq(req: AuthRequest): McpToolContext {
  return {
    userId: req.user!.userId,
    isCustomerUser: !!req.user?.customerId,
  };
}

function createServerForRequest(req: AuthRequest): McpServer {
  const server = new McpServer({
    name: 'myelin',
    version: '1.0.0',
  });

  const run = async (
    name: string,
    fn: () => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
  ) => {
    try {
      const result = await fn();
      logger.info('MCP tool finished', {
        tool: name,
        userId: req.user?.userId,
        isError: !!result.isError,
      });
      return result;
    } catch (error) {
      logger.error('MCP tool failed', {
        tool: name,
        userId: req.user?.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              message: error instanceof Error ? error.message : 'Tool failed',
            }),
          },
        ],
        isError: true,
      };
    }
  };

  server.registerTool(
    'resolve_context',
    {
      description:
        'Resolve Myelin MCP scope from repositoryUrl and/or projectIds (from myelin.mcp.json). Returns matched applications, effective projects, and write flags.',
      inputSchema: commonShape,
    },
    async (args) =>
      run('resolve_context', () => toolResolveContext(ctxFromReq(req), args as Record<string, unknown>))
  );

  server.registerTool(
    'list_skills',
    {
      description: 'List organization + application agent skills for the resolved MCP scope (org first).',
      inputSchema: commonShape,
    },
    async (args) =>
      run('list_skills', () => toolListDocs(ctxFromReq(req), args as Record<string, unknown>, 'skills'))
  );

  server.registerTool(
    'get_skill',
    {
      description: 'Get one skill by id or slug within the resolved scope.',
      inputSchema: { ...commonShape, id: z.union([z.number(), z.string()]).optional(), slug: z.string().optional() },
    },
    async (args) =>
      run('get_skill', () => toolGetDoc(ctxFromReq(req), args as Record<string, unknown>, 'skills'))
  );

  server.registerTool(
    'list_rules',
    {
      description: 'List organization + application agent rules for the resolved MCP scope (org first).',
      inputSchema: commonShape,
    },
    async (args) =>
      run('list_rules', () => toolListDocs(ctxFromReq(req), args as Record<string, unknown>, 'rules'))
  );

  server.registerTool(
    'get_rule',
    {
      description: 'Get one rule by id or slug within the resolved scope.',
      inputSchema: { ...commonShape, id: z.union([z.number(), z.string()]).optional(), slug: z.string().optional() },
    },
    async (args) =>
      run('get_rule', () => toolGetDoc(ctxFromReq(req), args as Record<string, unknown>, 'rules'))
  );

  server.registerTool(
    'list_my_tasks',
    {
      description:
        'List tasks assigned to the authenticated user within the MCP scope (projectIds and/or Application links).',
      inputSchema: { ...commonShape, projectId: z.union([z.number(), z.string()]).optional() },
    },
    async (args) =>
      run('list_my_tasks', () => toolListMyTasks(ctxFromReq(req), args as Record<string, unknown>))
  );

  server.registerTool(
    'get_task',
    {
      description: 'Get one of your tasks in MCP scope by taskId.',
      inputSchema: { ...commonShape, taskId: z.union([z.number(), z.string()]) },
    },
    async (args) =>
      run('get_task', () => toolGetTask(ctxFromReq(req), args as Record<string, unknown>))
  );

  server.registerTool(
    'list_project_meta',
    {
      description:
        'Catalog status, priority, and task type ids for effective projects (use before create_task).',
      inputSchema: commonShape,
    },
    async (args) =>
      run('list_project_meta', () => toolListProjectMeta(ctxFromReq(req), args as Record<string, unknown>))
  );

  server.registerTool(
    'create_task',
    {
      description:
        'Create a task in an effective project (requires Profile McpWritesEnabled and allowWrite true). Assigns to self.',
      inputSchema: {
        ...commonShape,
        projectId: z.union([z.number(), z.string()]),
        taskName: z.string(),
        description: z.string().optional(),
        status: z.union([z.number(), z.string()]).optional(),
        priority: z.union([z.number(), z.string()]).optional(),
        taskType: z.union([z.number(), z.string()]).optional(),
      },
    },
    async (args) =>
      run('create_task', () => toolCreateTask(ctxFromReq(req), args as Record<string, unknown>))
  );

  server.registerTool(
    'update_task',
    {
      description:
        'Update one of your tasks in MCP scope (requires Profile McpWritesEnabled and allowWrite true).',
      inputSchema: {
        ...commonShape,
        taskId: z.union([z.number(), z.string()]),
        taskName: z.string().optional(),
        description: z.string().nullable().optional(),
        status: z.union([z.number(), z.string()]).optional(),
        priority: z.union([z.number(), z.string()]).optional(),
        taskType: z.union([z.number(), z.string()]).optional(),
      },
    },
    async (args) =>
      run('update_task', () => toolUpdateTask(ctxFromReq(req), args as Record<string, unknown>))
  );

  return server;
}

async function handleMcp(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  if (req.user?.customerId) {
    res.status(403).json({ success: false, message: 'MCP is not available for customer portal users' });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createServerForRequest(req);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error('MCP HTTP handler failed', {
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP error' },
        id: null,
      });
    }
  } finally {
    try {
      await server.close();
    } catch {
      /* ignore */
    }
  }
}

router.all('/', authenticateToken, (req, res, next) => {
  void handleMcp(req as AuthRequest, res, next);
});

router.all('/session/:sessionId', authenticateToken, (req, res, next) => {
  void handleMcp(req as AuthRequest, res, next);
});

export default router;
