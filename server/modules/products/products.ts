import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { dbProvider, pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import PDFDocument from 'pdfkit';
import { cachedJson, ENTITY_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import { cache } from '../../services/cache';
import { delKeyFamily } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';
import {
  PRODUCT_IMAGE_TYPES,
  PRODUCT_UPLOAD_DIR,
  deletePublicUploadIfOwned,
  resolveImageMime,
  uploadErrorMessage,
  writePublicUpload,
} from '../../utils/publicUploads';
import { renderPatchNotesToPdf } from '../../utils/releaseNotesPdf';
import {
  chatCompletion,
  getLlmConfig,
  llmNotConfiguredMessage,
  prepareHtmlForLlm,
} from '../../utils/llmProvider';
import {
  mergeProductPatchNotesByApplication,
  validateProductVersionAppLinks,
  ProductAppVersionNoteSource,
} from '../../utils/productPatchNotes';

const router = Router();

const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

type ProductPermissionField =
  | 'CanManageProducts'
  | 'CanCreateProducts'
  | 'CanDeleteProducts'
  | 'CanManageProductReleases';

// ─── Permission helpers (mirrors applications.ts userCanManageApplications) ────

async function userHasProductPermission(
  userId: number,
  organizationId: number,
  permissionField: ProductPermissionField
): Promise<boolean> {
  const [user] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );
  if (!user.length) return false;
  if (user[0].isAdmin) return true;

  const roles: string[] = [];
  if (user[0].IsDeveloper) roles.push('Developer');
  if (user[0].IsSupport) roles.push('Support');
  if (user[0].IsManager) roles.push('Manager');

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT ${permissionField} FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );
    if (rolePerms.some((rp: any) => rp[permissionField] === 1)) return true;
  }

  const [orgPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.${permissionField} FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ? AND pg.OrganizationId = ?`,
    [userId, organizationId]
  );
  return orgPerms.some((op: any) => op[permissionField] === 1);
}

async function userCanManageProducts(userId: number, organizationId: number): Promise<boolean> {
  return userHasProductPermission(userId, organizationId, 'CanManageProducts');
}

async function userCanCreateProducts(userId: number, organizationId: number): Promise<boolean> {
  return userHasProductPermission(userId, organizationId, 'CanCreateProducts');
}

async function userCanDeleteProducts(userId: number, organizationId: number): Promise<boolean> {
  return userHasProductPermission(userId, organizationId, 'CanDeleteProducts');
}

async function userCanManageProductReleases(userId: number, organizationId: number): Promise<boolean> {
  return userHasProductPermission(userId, organizationId, 'CanManageProductReleases');
}

// ─── Small helpers ──────────────────────────────────────────────────────────────

function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split('T')[0];
}

async function getActiveProductOrganizationId(productId: string | number | string[]): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT OrganizationId FROM Products WHERE Id = ? AND IsActive = 1',
    [productId]
  );
  return rows.length ? Number(rows[0].OrganizationId) : null;
}

async function getProductVersionContext(
  productId: string | number | string[],
  versionId: string | number | string[]
): Promise<{ organizationId: number } | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.OrganizationId
     FROM ProductVersions pv
     INNER JOIN Products p ON p.Id = pv.ProductId
     WHERE pv.Id = ? AND pv.ProductId = ? AND p.IsActive = 1`,
    [versionId, productId]
  );
  return rows.length ? { organizationId: Number(rows[0].OrganizationId) } : null;
}

async function invalidateProductCaches(
  productId: number | string | string[] | undefined,
  organizationId?: number | string | string[] | null
): Promise<void> {
  if (productId !== undefined) {
    await cache.del(cacheKeys.product(productId));
    await cache.del(cacheKeys.productVersions(productId));
  }
  if (organizationId !== undefined && organizationId !== null) {
    await delKeyFamily(cacheKeys.orgProducts(organizationId));
  }
}

async function insertProductCustomerIfMissing(productId: number | string | string[], customerId: number): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ProductCustomers (ProductId, CustomerId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ProductCustomers WHERE ProductId = ? AND CustomerId = ?
       )`,
      [productId, customerId, productId, customerId]
    );
    return;
  }
  await pool.execute(
    'INSERT IGNORE INTO ProductCustomers (ProductId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [productId, customerId]
  );
}

async function insertProductApplicationIfMissing(productId: number | string | string[], applicationId: number): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ProductApplications (ProductId, ApplicationId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ProductApplications WHERE ProductId = ? AND ApplicationId = ?
       )`,
      [productId, applicationId, productId, applicationId]
    );
    return;
  }
  await pool.execute(
    'INSERT IGNORE INTO ProductApplications (ProductId, ApplicationId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [productId, applicationId]
  );
}

async function insertProductVersionAppLinkIfMissing(
  productVersionId: number | string | string[],
  applicationVersionId: number
): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ProductVersionApplicationVersions (ProductVersionId, ApplicationVersionId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ProductVersionApplicationVersions WHERE ProductVersionId = ? AND ApplicationVersionId = ?
       )`,
      [productVersionId, applicationVersionId, productVersionId, applicationVersionId]
    );
    return;
  }
  await pool.execute(
    'INSERT IGNORE INTO ProductVersionApplicationVersions (ProductVersionId, ApplicationVersionId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [productVersionId, applicationVersionId]
  );
}

async function syncProductCustomers(productId: number | string | string[], customerIds: unknown): Promise<void> {
  if (!Array.isArray(customerIds)) return;

  await pool.execute('DELETE FROM ProductCustomers WHERE ProductId = ?', [productId]);

  const normalizedIds = customerIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  for (const customerId of normalizedIds) {
    await insertProductCustomerIfMissing(productId, customerId);
  }
}

/** Replace ProductApplications catalog. Only applications in the product's own org and active are kept. */
async function syncProductApplications(
  productId: number | string | string[],
  organizationId: number | string | string[],
  applicationIds: unknown
): Promise<void> {
  if (!Array.isArray(applicationIds)) return;

  await pool.execute('DELETE FROM ProductApplications WHERE ProductId = ?', [productId]);

  const normalizedIds = applicationIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalizedIds.length === 0) return;

  const placeholders = normalizedIds.map(() => '?').join(',');
  const [validApps] = await pool.execute<RowDataPacket[]>(
    `SELECT Id FROM Applications WHERE Id IN (${placeholders}) AND OrganizationId = ? AND IsActive = 1`,
    [...normalizedIds, organizationId]
  );

  for (const row of validApps) {
    await insertProductApplicationIfMissing(productId, Number(row.Id));
  }
}

/** Fetch linked application versions for a product version, joined with Applications/ApplicationVersions. */
async function fetchLinkedAppVersionSources(
  productVersionId: number | string | string[]
): Promise<ProductAppVersionNoteSource[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.Id as ApplicationId, a.Name as ApplicationName, av.Id as ApplicationVersionId,
            av.VersionNumber, av.PatchNotes
     FROM ProductVersionApplicationVersions pvav
     INNER JOIN ApplicationVersions av ON av.Id = pvav.ApplicationVersionId
     INNER JOIN Applications a ON a.Id = av.ApplicationId
     WHERE pvav.ProductVersionId = ?`,
    [productVersionId]
  );

  return rows.map((row) => ({
    applicationId: Number(row.ApplicationId),
    applicationName: String(row.ApplicationName || ''),
    applicationVersionId: Number(row.ApplicationVersionId),
    versionNumber: String(row.VersionNumber || ''),
    patchNotes: row.PatchNotes,
  }));
}

// ─── Products ───────────────────────────────────────────────────────────────────

// GET /api/products - list all products visible to the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId } = req.query;

    const listKey = organizationId
      ? cacheKeys.orgProducts(parseInt(organizationId as string))
      : `${cacheKeys.userOrganizations(userId!)}:products`;

    const products = await cachedJson(listKey, ENTITY_TTL_SECONDS, async () => {
      let query = `
        SELECT p.*,
               u.FirstName, u.LastName, u.Username as CreatorUsername,
               o.Name as OrganizationName,
               (
                 SELECT COUNT(*) FROM ProductApplications pa WHERE pa.ProductId = p.Id
               ) as ApplicationCount,
               (
                 SELECT COUNT(*) FROM ProductCustomers pc WHERE pc.ProductId = p.Id
               ) as CustomerCount,
               (
                 SELECT COUNT(*) FROM ProductVersions pv WHERE pv.ProductId = p.Id
               ) as VersionCount
        FROM Products p
        LEFT JOIN Users u ON p.CreatedBy = u.Id
        LEFT JOIN Organizations o ON p.OrganizationId = o.Id
        INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
        WHERE p.IsActive = 1
      `;
      const params: (number | string)[] = [userId!];

      if (organizationId) {
        query += ' AND p.OrganizationId = ?';
        params.push(parseInt(organizationId as string));
      }

      query += ' ORDER BY p.Name ASC';

      const [productRows] = await pool.execute<RowDataPacket[]>(query, params);

      for (const product of productRows) {
        const [customers] = await pool.execute<RowDataPacket[]>(
          `SELECT c.Id, c.Name FROM Customers c
           INNER JOIN ProductCustomers pc ON c.Id = pc.CustomerId
           WHERE pc.ProductId = ?`,
          [product.Id]
        );
        product.Customers = customers;

        const [applications] = await pool.execute<RowDataPacket[]>(
          `SELECT a.Id, a.Name, a.ImagePath FROM Applications a
           INNER JOIN ProductApplications pa ON a.Id = pa.ApplicationId
           WHERE pa.ProductId = ?`,
          [product.Id]
        );
        product.Applications = applications;
      }

      return productRows;
    });

    res.json({ success: true, products });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// GET /api/products/ai/availability - checks if LLM provider is configured
router.get('/ai/availability', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getLlmConfig();
    return res.json({
      success: true,
      configured: config.isConfigured,
      provider: config.provider,
    });
  } catch (error: any) {
    logger.error('AI availability check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check AI availability' });
  }
});

// GET /api/products/:id - get product detail
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const product = await cachedJson(cacheKeys.product(id), ENTITY_TTL_SECONDS, async () => {
      const [products] = await pool.execute<RowDataPacket[]>(
        `SELECT p.*, u.FirstName, u.LastName, u.Username as CreatorUsername, o.Name as OrganizationName
         FROM Products p
         LEFT JOIN Users u ON p.CreatedBy = u.Id
         LEFT JOIN Organizations o ON p.OrganizationId = o.Id
         INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
         WHERE p.Id = ? AND p.IsActive = 1`,
        [userId, id]
      );

      if (products.length === 0) {
        return null;
      }

      const record = products[0];

      const [customers] = await pool.execute<RowDataPacket[]>(
        `SELECT c.Id, c.Name, c.Email FROM Customers c
         INNER JOIN ProductCustomers pc ON c.Id = pc.CustomerId
         WHERE pc.ProductId = ?`,
        [id]
      );
      record.Customers = customers;

      const [applications] = await pool.execute<RowDataPacket[]>(
        `SELECT a.Id, a.Name, a.ImagePath, a.OrganizationId FROM Applications a
         INNER JOIN ProductApplications pa ON a.Id = pa.ApplicationId
         WHERE pa.ProductId = ?`,
        [id]
      );
      record.Applications = applications;

      return record;
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, product });
  } catch (error) {
    logger.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST /api/products - create product
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { Name, Description, OrganizationId, IsCustomerSpecific, customerIds, applicationIds } = req.body;

    if (!Name || !OrganizationId) {
      return res.status(400).json({ success: false, message: 'Name and OrganizationId are required' });
    }

    if (!(await userCanCreateProducts(userId!, OrganizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to create products.' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Products (Name, Description, IsCustomerSpecific, OrganizationId, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [Name, Description || null, IsCustomerSpecific ? 1 : 0, OrganizationId, userId]
    );

    const productId = result.insertId;

    if (Array.isArray(customerIds)) {
      await syncProductCustomers(productId, customerIds);
    }
    if (Array.isArray(applicationIds)) {
      await syncProductApplications(productId, OrganizationId, applicationIds);
    }

    await invalidateProductCaches(productId, OrganizationId);

    res.status(201).json({ success: true, id: productId, message: 'Product created' });
  } catch (error) {
    logger.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// PUT /api/products/:id - update product
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { Name, Description, IsCustomerSpecific } = req.body;

    if (!Name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const organizationId = await getActiveProductOrganizationId(id);
    if (organizationId === null) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!(await userCanManageProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage products.' });
    }

    const isCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    await pool.execute(
      `UPDATE Products
       SET Name = ?, Description = ?,
           IsCustomerSpecific = COALESCE(?, IsCustomerSpecific),
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [Name, Description || null, isCustomerSpecificValue, id]
    );

    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    logger.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// DELETE /api/products/:id - soft delete
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const organizationId = await getActiveProductOrganizationId(id);
    if (organizationId === null) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!(await userCanDeleteProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to delete products.' });
    }

    await pool.execute('UPDATE Products SET IsActive = 0 WHERE Id = ?', [id]);
    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    logger.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

// POST /api/products/:id/image - upload product image (local path only)
router.post('/:id/image', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { fileName, fileData, fileSize } = req.body || {};
    const fileType = resolveImageMime(req.body?.fileType, fileName);

    if (!fileData) {
      return res.status(400).json({ success: false, message: 'fileData is required' });
    }
    if (!fileType || !PRODUCT_IMAGE_TYPES.has(fileType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed. Use PNG, JPEG, WebP, or SVG.' });
    }

    const [products] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, OrganizationId, ImagePath FROM Products WHERE Id = ? AND IsActive = 1',
      [id]
    );
    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const organizationId = Number(products[0].OrganizationId);
    if (!(await userCanManageProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage products.' });
    }

    const buffer = Buffer.from(
      String(fileData).includes(',') ? String(fileData).split(',')[1] : String(fileData),
      'base64'
    );
    const size = Number(fileSize) || buffer.length;
    if (size > MAX_PRODUCT_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: 'File size exceeds 2MB limit' });
    }

    const { publicPath } = writePublicUpload({
      dir: PRODUCT_UPLOAD_DIR,
      publicPrefix: '/uploads/products',
      fileType,
      fileName: fileName ? String(fileName) : undefined,
      fileData: String(fileData),
      namePrefix: `product-${id}`,
    });

    deletePublicUploadIfOwned(products[0].ImagePath, PRODUCT_UPLOAD_DIR);

    await pool.execute(
      'UPDATE Products SET ImagePath = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?',
      [publicPath, id]
    );
    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, imagePath: publicPath, message: 'Product image uploaded' });
  } catch (error) {
    logger.error('Error uploading product image:', error);
    res.status(500).json({
      success: false,
      message: uploadErrorMessage(error, 'Failed to upload product image'),
    });
  }
});

// DELETE /api/products/:id/image - remove product image
router.delete('/:id/image', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [products] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, OrganizationId, ImagePath FROM Products WHERE Id = ? AND IsActive = 1',
      [id]
    );
    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const organizationId = Number(products[0].OrganizationId);
    if (!(await userCanManageProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage products.' });
    }

    deletePublicUploadIfOwned(products[0].ImagePath, PRODUCT_UPLOAD_DIR);
    await pool.execute(
      'UPDATE Products SET ImagePath = NULL, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?',
      [id]
    );
    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, message: 'Product image removed' });
  } catch (error) {
    logger.error('Error deleting product image:', error);
    res.status(500).json({
      success: false,
      message: uploadErrorMessage(error, 'Failed to remove product image'),
    });
  }
});

// ─── Product ↔ Applications catalog ────────────────────────────────────────────

// PUT /api/products/:id/applications - replace the application catalog for a product
router.put('/:id/applications', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { applicationIds } = req.body;

    const organizationId = await getActiveProductOrganizationId(id);
    if (organizationId === null) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!(await userCanManageProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage products.' });
    }

    await syncProductApplications(id, organizationId, Array.isArray(applicationIds) ? applicationIds : []);
    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, message: 'Product applications updated' });
  } catch (error) {
    logger.error('Error updating product applications:', error);
    res.status(500).json({ success: false, message: 'Failed to update product applications' });
  }
});

// ─── Product ↔ Customers ────────────────────────────────────────────────────────

// PUT /api/products/:id/customers - replace customer associations for a product
router.put('/:id/customers', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { customerIds } = req.body;

    const organizationId = await getActiveProductOrganizationId(id);
    if (organizationId === null) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!(await userCanManageProducts(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage products.' });
    }

    await syncProductCustomers(id, Array.isArray(customerIds) ? customerIds : []);
    await invalidateProductCaches(id, organizationId);

    res.json({ success: true, message: 'Product customers updated' });
  } catch (error) {
    logger.error('Error updating product customers:', error);
    res.status(500).json({ success: false, message: 'Failed to update product customers' });
  }
});

// ─── Versions ─────────────────────────────────────────────────────────────────

// GET /api/products/:id/versions - list versions
router.get('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const versions = await cachedJson(cacheKeys.productVersions(id), ENTITY_TTL_SECONDS, async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT pv.*, u.FirstName, u.LastName, c.Name as CustomerName,
                (
                  SELECT COUNT(*) FROM ProductVersionApplicationVersions pvav
                  WHERE pvav.ProductVersionId = pv.Id
                ) as LinkedApplicationCount
         FROM ProductVersions pv
         LEFT JOIN Users u ON pv.CreatedBy = u.Id
         LEFT JOIN Customers c ON c.Id = pv.CustomerId
         WHERE pv.ProductId = ?
         ORDER BY pv.CreatedAt DESC`,
        [id]
      );

      return rows;
    });

    res.json({ success: true, versions });
  } catch (error) {
    logger.error('Error fetching product versions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch versions' });
  }
});

// GET /api/products/:id/versions/:versionId - version detail with linked application versions
router.get('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT pv.*, u.FirstName, u.LastName, p.Name as ProductName, c.Name as CustomerName
       FROM ProductVersions pv
       LEFT JOIN Users u ON pv.CreatedBy = u.Id
       LEFT JOIN Products p ON pv.ProductId = p.Id
       LEFT JOIN Customers c ON c.Id = pv.CustomerId
       WHERE pv.Id = ? AND pv.ProductId = ?`,
      [versionId, id]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    const [links] = await pool.execute<RowDataPacket[]>(
      `SELECT pvav.ApplicationVersionId, a.Id as ApplicationId, a.Name as ApplicationName,
              av.VersionNumber, av.VersionName, av.Status as ApplicationVersionStatus,
              av.ReleaseDate, av.PatchNotes
       FROM ProductVersionApplicationVersions pvav
       INNER JOIN ApplicationVersions av ON av.Id = pvav.ApplicationVersionId
       INNER JOIN Applications a ON a.Id = av.ApplicationId
       WHERE pvav.ProductVersionId = ?
       ORDER BY a.Name ASC`,
      [versionId]
    );

    version.ApplicationVersions = links;

    res.json({ success: true, version });
  } catch (error) {
    logger.error('Error fetching product version:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch version' });
  }
});

// POST /api/products/:id/versions - create version
router.post('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const productId = Array.isArray(id) ? id[0] : id;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId, links } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const isCustomerSpecific = IsCustomerSpecific ? 1 : 0;
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);
    const normalizedLinks: Array<{ applicationId: number; applicationVersionId: number }> = Array.isArray(links)
      ? links.map((link: any) => ({
          applicationId: Number(link?.applicationId),
          applicationVersionId: Number(link?.applicationVersionId),
        }))
      : [];

    if (!VersionNumber) {
      return res.status(400).json({ success: false, message: 'VersionNumber is required' });
    }

    if (isCustomerSpecific === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
    }

    const organizationId = await getActiveProductOrganizationId(productId);
    if (organizationId === null) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!(await userCanManageProductReleases(userId!, organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage product releases.' });
    }

    let avInfoByVersionId = new Map<number, { applicationId: number; applicationName: string; versionNumber: string; patchNotes: string | null }>();

    if (normalizedLinks.length > 0) {
      const [catalogRows] = await pool.execute<RowDataPacket[]>(
        'SELECT ApplicationId FROM ProductApplications WHERE ProductId = ?',
        [productId]
      );
      const catalogApplicationIds = new Set(catalogRows.map((row) => Number(row.ApplicationId)));

      const appVersionIds = normalizedLinks.map((link) => link.applicationVersionId);
      const placeholders = appVersionIds.map(() => '?').join(',');
      const [avRows] = await pool.execute<RowDataPacket[]>(
        `SELECT av.Id, av.ApplicationId, av.VersionNumber, av.PatchNotes, a.Name as ApplicationName
         FROM ApplicationVersions av
         INNER JOIN Applications a ON a.Id = av.ApplicationId
         WHERE av.Id IN (${placeholders})`,
        appVersionIds
      );

      const versionToApplicationId = new Map<number, number>();
      for (const row of avRows) {
        versionToApplicationId.set(Number(row.Id), Number(row.ApplicationId));
        avInfoByVersionId.set(Number(row.Id), {
          applicationId: Number(row.ApplicationId),
          applicationName: String(row.ApplicationName || ''),
          versionNumber: String(row.VersionNumber || ''),
          patchNotes: row.PatchNotes,
        });
      }

      const validation = validateProductVersionAppLinks(normalizedLinks, {
        catalogApplicationIds,
        versionToApplicationId,
      });
      if (!validation.ok) {
        return res.status(400).json({ success: false, message: validation.message });
      }
    }

    let finalPatchNotes = PatchNotes || null;
    if (!finalPatchNotes && normalizedLinks.length > 0) {
      const sources: ProductAppVersionNoteSource[] = normalizedLinks.map((link) => {
        const info = avInfoByVersionId.get(link.applicationVersionId);
        return {
          applicationId: link.applicationId,
          applicationName: info?.applicationName || '',
          applicationVersionId: link.applicationVersionId,
          versionNumber: info?.versionNumber || '',
          patchNotes: info?.patchNotes,
        };
      });
      finalPatchNotes = mergeProductPatchNotesByApplication(sources);
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ProductVersions (ProductId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        productId,
        VersionNumber,
        VersionName || null,
        Status || 'Planning',
        normalizedReleaseDate,
        finalPatchNotes,
        isCustomerSpecific,
        isCustomerSpecific === 1 ? normalizedCustomerId : null,
        userId,
      ]
    );

    const versionId = result.insertId;

    for (const link of normalizedLinks) {
      await insertProductVersionAppLinkIfMissing(versionId, link.applicationVersionId);
    }

    await invalidateProductCaches(productId, organizationId);

    res.status(201).json({ success: true, id: versionId, message: 'Version created' });
  } catch (error) {
    logger.error('Error creating product version:', error);
    res.status(500).json({ success: false, message: 'Failed to create version' });
  }
});

// PUT /api/products/:id/versions/:versionId - update version
router.put('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);

    const context = await getProductVersionContext(id, versionId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    if (!(await userCanManageProductReleases(userId!, context.organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage product releases.' });
    }

    const isCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    if (isCustomerSpecificValue === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
    }

    await pool.execute(
      `UPDATE ProductVersions
       SET VersionNumber = ?, VersionName = ?, Status = ?, ReleaseDate = ?, PatchNotes = ?,
           IsCustomerSpecific = COALESCE(?, IsCustomerSpecific),
           CustomerId = CASE
             WHEN ? IS NULL THEN CustomerId
             WHEN ? = 1 THEN ?
             ELSE NULL
           END,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        VersionNumber,
        VersionName || null,
        Status || 'Planning',
        normalizedReleaseDate,
        PatchNotes || null,
        isCustomerSpecificValue,
        isCustomerSpecificValue,
        isCustomerSpecificValue,
        normalizedCustomerId,
        versionId,
      ]
    );

    await invalidateProductCaches(id, context.organizationId);

    res.json({ success: true, message: 'Version updated' });
  } catch (error) {
    logger.error('Error updating product version:', error);
    res.status(500).json({ success: false, message: 'Failed to update version' });
  }
});

// DELETE /api/products/:id/versions/:versionId - delete links then version
router.delete('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;

    const context = await getProductVersionContext(id, versionId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    if (!(await userCanManageProductReleases(userId!, context.organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage product releases.' });
    }

    await pool.execute('DELETE FROM ProductVersionApplicationVersions WHERE ProductVersionId = ?', [versionId]);
    await pool.execute('DELETE FROM ProductVersions WHERE Id = ?', [versionId]);

    await invalidateProductCaches(id, context.organizationId);

    res.json({ success: true, message: 'Version deleted' });
  } catch (error) {
    logger.error('Error deleting product version:', error);
    res.status(500).json({ success: false, message: 'Failed to delete version' });
  }
});

// ─── Version ↔ Application versions links ──────────────────────────────────────

// PUT /api/products/:id/versions/:versionId/application-versions - replace linked application versions
router.put('/:id/versions/:versionId/application-versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;
    const { links } = req.body;

    const context = await getProductVersionContext(id, versionId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    if (!(await userCanManageProductReleases(userId!, context.organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage product releases.' });
    }

    const normalizedLinks: Array<{ applicationId: number; applicationVersionId: number }> = Array.isArray(links)
      ? links.map((link: any) => ({
          applicationId: Number(link?.applicationId),
          applicationVersionId: Number(link?.applicationVersionId),
        }))
      : [];

    const [catalogRows] = await pool.execute<RowDataPacket[]>(
      'SELECT ApplicationId FROM ProductApplications WHERE ProductId = ?',
      [id]
    );
    const catalogApplicationIds = new Set(catalogRows.map((row) => Number(row.ApplicationId)));

    const versionToApplicationId = new Map<number, number>();
    if (normalizedLinks.length > 0) {
      const appVersionIds = normalizedLinks.map((link) => link.applicationVersionId);
      const placeholders = appVersionIds.map(() => '?').join(',');
      const [avRows] = await pool.execute<RowDataPacket[]>(
        `SELECT Id, ApplicationId FROM ApplicationVersions WHERE Id IN (${placeholders})`,
        appVersionIds
      );
      for (const row of avRows) {
        versionToApplicationId.set(Number(row.Id), Number(row.ApplicationId));
      }
    }

    const validation = validateProductVersionAppLinks(normalizedLinks, {
      catalogApplicationIds,
      versionToApplicationId,
    });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    await pool.execute('DELETE FROM ProductVersionApplicationVersions WHERE ProductVersionId = ?', [versionId]);
    for (const link of normalizedLinks) {
      await insertProductVersionAppLinkIfMissing(versionId, link.applicationVersionId);
    }

    await invalidateProductCaches(id, context.organizationId);

    res.json({ success: true, message: 'Linked application versions updated' });
  } catch (error) {
    logger.error('Error updating linked application versions:', error);
    res.status(500).json({ success: false, message: 'Failed to update linked application versions' });
  }
});

// POST /api/products/:id/versions/:versionId/rebuild-patch-notes - overwrite PatchNotes from linked app versions
router.post('/:id/versions/:versionId/rebuild-patch-notes', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;

    const context = await getProductVersionContext(id, versionId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    if (!(await userCanManageProductReleases(userId!, context.organizationId))) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage product releases.' });
    }

    const sources = await fetchLinkedAppVersionSources(versionId);
    const patchNotes = mergeProductPatchNotesByApplication(sources);

    await pool.execute(
      'UPDATE ProductVersions SET PatchNotes = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?',
      [patchNotes, versionId]
    );

    await invalidateProductCaches(id, context.organizationId);

    res.json({ success: true, patchNotes, message: 'Patch notes rebuilt' });
  } catch (error) {
    logger.error('Error rebuilding patch notes:', error);
    res.status(500).json({ success: false, message: 'Failed to rebuild patch notes' });
  }
});

// POST /api/products/:id/versions/improve-patch-notes - improve patch notes with AI, preserving per-application sections
router.post('/:id/versions/improve-patch-notes', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const productId = Number(req.params.id);
    const patchNotes = String(req.body?.patchNotes || '').trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id
       FROM Products p
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?
       LIMIT 1`,
      [productId, userId]
    );

    if (!accessRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied' });
    }

    const llmConfig = await getLlmConfig();
    if (!llmConfig.isConfigured) {
      return res.status(400).json({ success: false, message: llmNotConfiguredMessage(llmConfig) });
    }

    const systemPrompt = [
      'You improve product release notes that aggregate patch notes from multiple applications.',
      'Mandatory output format rules:',
      '- Return HTML only (no markdown, no code fences).',
      '- The input contains one <h2> heading per linked application version; you MUST keep exactly one <h2> section per application.',
      '- Do not merge, remove, reorder, or flatten the <h2> sections into a single section.',
      '- Only improve the content beneath each <h2> heading; keep the heading text unchanged.',
      '- Use concise, clear bullet points (<ul><li>...</li></ul>) within each section.',
      '- Preserve factual meaning; do not invent features.',
    ].join('\n');

    const userPrompt = JSON.stringify({
      currentPatchNotesHtml: prepareHtmlForLlm(patchNotes),
      instruction: 'Improve clarity and readability while preserving meaning and the per-application h2 section structure.',
    });

    let improved = '';
    try {
      const result = await chatCompletion(llmConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: 120_000,
      });
      improved = result.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM request failed.';
      return res.status(502).json({ success: false, message });
    }

    if (!improved) {
      return res.status(500).json({ success: false, message: 'AI returned empty patch notes.' });
    }

    return res.json({ success: true, patchNotes: improved });
  } catch (error: any) {
    logger.error('Improve product patch notes error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to improve patch notes' });
  }
});

// GET /api/products/:id/versions/:versionId/pdf - download PDF for a specific product version
router.get('/:id/versions/:versionId/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user?.userId;

    const [products] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Name FROM Products p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE p.Id = ? AND p.IsActive = 1`,
      [userId, id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const productName = products[0].Name;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT VersionNumber, VersionName, ReleaseDate, PatchNotes, Status
       FROM ProductVersions
       WHERE Id = ? AND ProductId = ?`,
      [versionId, id]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `${String(productName).replace(/[^a-z0-9]/gi, '_')}-v${version.VersionNumber}-release-notes.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    doc.rect(0, 0, 595, 70).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Release Notes', 40, 20);
    doc.fontSize(14).font('Helvetica')
      .text(`${productName} - Version ${version.VersionNumber}`, 40, 45);
    doc.fillColor(darkGray);

    doc.y = 90;

    doc.fontSize(11).fillColor(midGray);
    if (version.VersionName) {
      doc.text(`Version Name: ${version.VersionName}`, 40);
      doc.moveDown(0.3);
    }
    if (version.ReleaseDate) {
      doc.text(`Release Date: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 40);
      doc.moveDown(0.3);
    }
    const statusColor = version.Status === 'Released' ? green : midGray;
    doc.fillColor(statusColor).text(`Status: ${version.Status}`, 40);
    doc.moveDown(1);

    doc.fillColor(darkGray).fontSize(12).font('Helvetica-Bold')
      .text('Patch Notes', 40);
    doc.moveDown(0.5);

    await renderPatchNotesToPdf(doc, version.PatchNotes, {
      textSize: 10,
      x: 40,
      width: 515,
      darkGray,
      midGray,
    });

    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  } catch (error) {
    logger.error('Error generating product version PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

export default router;
