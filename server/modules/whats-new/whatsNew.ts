import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { pool, RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { validateRequest } from '../../utils/validation';
import logger from '../../utils/logger';
import {
  ChangelogEntry,
  ChangelogFile,
  filterChangelogEntries,
  normalizeVersion,
} from './changelogFilter';

const router = Router();

const markSeenSchema = z.preprocess(
  (val) => (val == null ? {} : val),
  z.object({}).passthrough()
);

let cachedChangelog: ChangelogFile | null = null;
let cachedPackageVersion: string | null = null;

function resolveChangelogPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'docs/whats-new/changelog.json'),
    path.join(__dirname, '../../../docs/whats-new/changelog.json'),
    path.join(__dirname, '../../../../docs/whats-new/changelog.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePackageJsonPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '../../../package.json'),
    path.join(__dirname, '../../../../package.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadChangelogFile(): ChangelogFile {
  if (cachedChangelog) return cachedChangelog;
  const filePath = resolveChangelogPath();
  if (!filePath) {
    logger.warn('What’s New changelog.json not found');
    cachedChangelog = { versions: [] };
    return cachedChangelog;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ChangelogFile;
    cachedChangelog = {
      versions: Array.isArray(parsed?.versions) ? parsed.versions : [],
    };
  } catch (error) {
    logger.error('Failed to parse What’s New changelog.json', error);
    cachedChangelog = { versions: [] };
  }
  return cachedChangelog;
}

export function getCurrentAppVersion(): string {
  if (cachedPackageVersion) return cachedPackageVersion;
  const filePath = resolvePackageJsonPath();
  if (!filePath) {
    cachedPackageVersion = '0.0.0';
    return cachedPackageVersion;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { version?: string };
    cachedPackageVersion = normalizeVersion(pkg.version) || '0.0.0';
  } catch (error) {
    logger.error('Failed to read package.json version for What’s New', error);
    cachedPackageVersion = '0.0.0';
  }
  return cachedPackageVersion;
}

/** Test helper — clear in-memory caches. */
export function resetWhatsNewCaches(): void {
  cachedChangelog = null;
  cachedPackageVersion = null;
}

export async function getUserLastSeenAppVersion(userId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT LastSeenAppVersion FROM Users WHERE Id = ?',
    [userId]
  );
  if (!rows.length) return null;
  return normalizeVersion(rows[0].LastSeenAppVersion as string | null);
}

export async function setUserLastSeenAppVersion(
  userId: number,
  version: string
): Promise<void> {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    throw new Error('Invalid app version');
  }
  await pool.execute<ResultSetHeader>(
    'UPDATE Users SET LastSeenAppVersion = ? WHERE Id = ?',
    [normalized, userId]
  );
}

function buildEntries(
  full: boolean,
  lastSeenAppVersion: string | null,
  sinceQuery: string | null
): ChangelogEntry[] {
  const currentVersion = getCurrentAppVersion();
  const changelog = loadChangelogFile();
  if (full) {
    return filterChangelogEntries(changelog.versions, currentVersion, { full: true });
  }
  const since = sinceQuery != null ? sinceQuery : lastSeenAppVersion;
  return filterChangelogEntries(changelog.versions, currentVersion, { since, full: false });
}

/**
 * @swagger
 * /api/whats-new:
 *   get:
 *     summary: Get What’s New changelog entries for the current user
 *     tags: [WhatsNew]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: full
 *         schema:
 *           type: string
 *         description: When 1/true, return full history up to current version
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *         description: Optional exclusive lower-bound semver (overrides LastSeenAppVersion for filtering)
 *     responses:
 *       200:
 *         description: Changelog payload
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const fullRaw = String(req.query.full ?? '').toLowerCase();
    const full = fullRaw === '1' || fullRaw === 'true';
    const sinceQuery = normalizeVersion(
      typeof req.query.since === 'string' ? req.query.since : null
    );

    const lastSeenAppVersion = await getUserLastSeenAppVersion(userId);
    const currentVersion = getCurrentAppVersion();
    const entries = buildEntries(full, lastSeenAppVersion, sinceQuery);

    return res.json({
      success: true,
      data: {
        currentVersion,
        lastSeenAppVersion,
        entries,
      },
    });
  } catch (error) {
    logger.error('Error fetching What’s New changelog:', error);
    return res.status(500).json({ success: false, message: 'Failed to load What’s New' });
  }
});

/**
 * @swagger
 * /api/whats-new/seen:
 *   patch:
 *     summary: Mark current app version as seen for the authenticated user
 *     tags: [WhatsNew]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Version acknowledged
 */
router.patch(
  '/seen',
  authenticateToken,
  validateRequest(markSeenSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // Customer portal users do not use What’s New auto-modal; still allow no-op mark.
      const currentVersion = getCurrentAppVersion();
      await setUserLastSeenAppVersion(userId, currentVersion);

      return res.json({
        success: true,
        data: { lastSeenAppVersion: currentVersion },
        message: 'What’s New acknowledged',
      });
    } catch (error) {
      logger.error('Error marking What’s New as seen:', error);
      return res.status(500).json({ success: false, message: 'Failed to update seen version' });
    }
  }
);

export default router;
