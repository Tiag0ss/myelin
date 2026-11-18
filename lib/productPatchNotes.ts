import {
  buildPatchNotesFromTasksAndCommits,
  type PatchNoteCommitInput,
  type PatchNoteIssueRefInput,
  type PatchNoteTaskInput,
} from './releasePatchNotes';

export type ProductAppVersionNoteSource = {
  applicationId: number;
  applicationName: string;
  applicationVersionId: number;
  versionNumber: string;
  versionName?: string | null;
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

/** Known heading for the wizard related-apps list (also matched case-insensitively). */
export const RELATED_APPLICATION_VERSIONS_HEADING = 'Related application versions';

/**
 * Split out the leading "Related application versions" block so AI improve can
 * edit only the changelog body, then reattach this section unchanged.
 */
export function splitRelatedApplicationVersionsSection(html: string): {
  relatedSection: string;
  body: string;
} {
  const source = String(html || '').trim();
  if (!source) {
    return { relatedSection: '', body: '' };
  }

  const re =
    /(<h2[^>]*>\s*Related application versions\s*<\/h2>\s*(?:<ul[\s\S]*?<\/ul>)?)/i;
  const match = re.exec(source);
  if (!match || match.index == null) {
    return { relatedSection: '', body: source };
  }

  const relatedSection = String(match[1] || '').trim();
  const body = `${source.slice(0, match.index)}${source.slice(match.index + match[1].length)}`.trim();
  return { relatedSection, body };
}

/** Prepend a previously extracted related section ahead of improved body HTML. */
export function prependRelatedApplicationVersionsSection(
  relatedSection: string,
  bodyHtml: string
): string {
  const related = String(relatedSection || '').trim();
  const body = String(bodyHtml || '').trim();
  if (!related) return body;
  if (!body) return related;
  // Drop a duplicate related block if the model kept/rewrote one.
  const withoutDup = splitRelatedApplicationVersionsSection(body).body;
  return withoutDup ? `${related}\n${withoutDup}` : related;
}

/**
 * Wizard product PatchNotes baseline:
 * 1) Related application versions list
 * 2) Changelog from associated tasks (same bullet/link format as application releases)
 */
export function buildWizardProductPatchNotes(
  sources: ProductAppVersionNoteSource[],
  options?: {
    relatedHeading?: string;
    tasks?: Array<PatchNoteTaskInput & PatchNoteIssueRefInput>;
    commits?: PatchNoteCommitInput[];
    generalProjectLabel?: string;
    untypedLabel?: string;
  }
): string {
  if (!Array.isArray(sources) || sources.length === 0) {
    return '';
  }

  const sorted = [...sources].sort((a, b) =>
    a.applicationName.localeCompare(b.applicationName, undefined, { sensitivity: 'base' })
  );

  const heading = String(options?.relatedHeading || 'Related application versions').trim()
    || 'Related application versions';

  const relatedItems = sorted
    .map((source) => {
      const label = `${source.applicationName} ${source.versionNumber}`.trim();
      const name = source.versionName ? String(source.versionName).trim() : '';
      const text = name ? `${label} (${name})` : label;
      return `<li>${escapeHtml(text)}</li>`;
    })
    .join('');

  const relatedSection = `<h2>${escapeHtml(heading)}</h2>\n<ul>${relatedItems}</ul>`;
  const changelog = buildPatchNotesFromTasksAndCommits({
    tasks: options?.tasks || [],
    commits: options?.commits || [],
    generalProjectLabel: options?.generalProjectLabel,
    untypedLabel: options?.untypedLabel,
  });
  return changelog ? `${relatedSection}\n${changelog}` : relatedSection;
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
