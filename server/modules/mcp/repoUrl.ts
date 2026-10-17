/**
 * Normalize git remote / repository URLs for Application matching.
 * Supports https://host/path(.git) and git@host:path(.git).
 */

export function normalizeRepositoryUrlKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // git@host:path/to/repo.git
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(s);
  if (sshMatch) {
    const host = sshMatch[1].toLowerCase();
    let pathPart = sshMatch[2].replace(/\\/g, '/');
    pathPart = pathPart.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    pathPart = pathPart.replace(/^\/+/, '');
    return `${host}/${pathPart}`.toLowerCase();
  }

  // ssh://git@host/path
  if (/^ssh:\/\//i.test(s)) {
    s = s.replace(/^ssh:\/\//i, 'https://');
  }

  try {
    // Ensure URL parser has a scheme
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      s = `https://${s}`;
    }
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    let pathPart = u.pathname.replace(/\\/g, '/');
    // Trailing slash before .git so `repo.git/` still strips the suffix
    pathPart = pathPart.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    pathPart = pathPart.replace(/^\/+/, '');
    if (!host || !pathPart) return null;
    return `${host}/${pathPart}`.toLowerCase();
  } catch {
    // Fallback: strip scheme-ish and .git
    let fallback = s
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^git@/i, '')
      .replace(/\/+$/, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '')
      .replace(/:/g, '/');
    fallback = fallback.replace(/^\/+/, '').toLowerCase();
    return fallback.length > 0 ? fallback : null;
  }
}

export function repositoryUrlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizeRepositoryUrlKey(a);
  const kb = normalizeRepositoryUrlKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}
