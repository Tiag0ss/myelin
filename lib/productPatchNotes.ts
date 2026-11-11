export type ProductAppVersionNoteSource = {
  applicationId: number;
  applicationName: string;
  applicationVersionId: number;
  versionNumber: string;
  patchNotes: string | null | undefined;
};

/**
 * Build product PatchNotes HTML with one section per linked application version.
 * Sections are ordered by application name (case-insensitive).
 */
export function mergeProductPatchNotesByApplication(
  sources: ProductAppVersionNoteSource[]
): string {
  const sorted = [...sources].sort((a, b) =>
    a.applicationName.localeCompare(b.applicationName, undefined, { sensitivity: 'base' })
  );

  if (sorted.length === 0) {
    return '';
  }

  return sorted
    .map((source) => {
      const title = `${source.applicationName} ${source.versionNumber}`.trim();
      const body = String(source.patchNotes || '').trim();
      const bodyHtml = body || '<p><em>No patch notes for this application version.</em></p>';
      return `<h2>${escapeHtml(title)}</h2>\n${bodyHtml}`;
    })
    .join('\n');
}

/**
 * Validate product version → application version links:
 * - each applicationId appears at most once
 * - applicationVersionId must map to that applicationId when versionMap is provided
 */
export function validateProductVersionAppLinks(
  links: Array<{ applicationId: number; applicationVersionId: number }>,
  options?: {
    catalogApplicationIds?: Set<number>;
    versionToApplicationId?: Map<number, number>;
  }
): { ok: true } | { ok: false; message: string } {
  const seenApps = new Set<number>();

  for (const link of links) {
    const applicationId = Number(link.applicationId);
    const applicationVersionId = Number(link.applicationVersionId);
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return { ok: false, message: 'Invalid applicationId in links' };
    }
    if (!Number.isInteger(applicationVersionId) || applicationVersionId <= 0) {
      return { ok: false, message: 'Invalid applicationVersionId in links' };
    }
    if (seenApps.has(applicationId)) {
      return { ok: false, message: 'Only one application version is allowed per catalog application' };
    }
    seenApps.add(applicationId);

    if (options?.catalogApplicationIds && !options.catalogApplicationIds.has(applicationId)) {
      return { ok: false, message: 'Application is not in the product catalog' };
    }

    if (options?.versionToApplicationId) {
      const ownerAppId = options.versionToApplicationId.get(applicationVersionId);
      if (ownerAppId == null) {
        return { ok: false, message: 'Application version not found' };
      }
      if (ownerAppId !== applicationId) {
        return { ok: false, message: 'Application version does not belong to the selected application' };
      }
    }
  }

  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
