/**
 * Deep links that open a specific version detail panel on product/application pages.
 * Query shape matches useUrlTab (`tab`) plus `versionId`.
 */

export function productVersionHref(
  productId: number | string,
  versionId: number | string
): string {
  return `/products/${productId}?tab=versions&versionId=${encodeURIComponent(String(versionId))}`;
}

export function applicationVersionHref(
  applicationId: number | string,
  versionId: number | string
): string {
  return `/applications/${applicationId}?tab=versions&versionId=${encodeURIComponent(String(versionId))}`;
}

export function parseVersionIdParam(value: string | null | undefined): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
