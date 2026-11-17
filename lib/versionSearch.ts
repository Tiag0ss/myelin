/** Match a free-text query against version number/name/status/customer fields. */
export function versionRowMatchesSearch(
  version: {
    VersionNumber?: string | null;
    VersionName?: string | null;
    Status?: string | null;
    CustomerName?: string | null;
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    version.VersionNumber || '',
    version.VersionName || '',
    version.Status || '',
    version.CustomerName || '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/** Match a free-text query against list-API VersionLabels (numbers + names). */
export function versionLabelsMatchSearch(labels: string[] | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!Array.isArray(labels) || labels.length === 0) return false;
  return labels.some((label) => String(label).toLowerCase().includes(q));
}
