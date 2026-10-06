import type { Application, Request, Response } from 'express';
import { testConnection } from './config/database';
import { getRedisStatus, testRedisConnection } from './config/redis';
import logger from './utils/logger';

export interface HealthPayload {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime?: number;
  database?: 'connected' | 'disconnected';
  redis?: string;
}

export async function buildHealthPayload(): Promise<{ httpStatus: number; body: HealthPayload }> {
  const dbHealthy = await testConnection();
  const redisStatus = getRedisStatus();
  if (redisStatus !== 'disabled') {
    await testRedisConnection();
  }
  const status = dbHealthy ? 'healthy' : 'unhealthy';
  return {
    httpStatus: dbHealthy ? 200 : 503,
    body: {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: getRedisStatus(),
    },
  };
}

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { httpStatus, body } = await buildHealthPayload();
    res.status(httpStatus).json(body);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
}

/** Process is listening — used by Docker/Portainer. Must not depend on DB/Redis. */
export function liveHealthHandler(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

export function registerHealthRoute(server: Application): void {
  server.get('/health/live', liveHealthHandler);
  server.get('/health', healthHandler);
}
