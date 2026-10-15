import { getApiUrl } from './config';

export type WhatsNewEntry = {
  version: string;
  date?: string | null;
  title?: string;
  items: string[];
};

export type WhatsNewPayload = {
  currentVersion: string;
  lastSeenAppVersion: string | null;
  entries: WhatsNewEntry[];
};

type ApiSuccess<T> = { success: true; data: T; message?: string };
type ApiFailure = { success: false; message?: string };

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchWhatsNew(
  token: string,
  options: { full?: boolean; since?: string } = {}
): Promise<WhatsNewPayload> {
  const params = new URLSearchParams();
  if (options.full) params.set('full', '1');
  if (options.since) params.set('since', options.since);
  const qs = params.toString();
  const url = `${getApiUrl()}/api/whats-new${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
  });

  const data = await parseJson<ApiSuccess<WhatsNewPayload> | ApiFailure>(response);
  if (!response.ok || !data.success) {
    throw new Error(
      (!data.success && data.message) || 'Failed to load What’s New'
    );
  }
  return data.data;
}

export async function markWhatsNewSeen(token: string): Promise<string> {
  const response = await fetch(`${getApiUrl()}/api/whats-new/seen`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  const data = await parseJson<
    ApiSuccess<{ lastSeenAppVersion: string }> | ApiFailure
  >(response);
  if (!response.ok || !data.success) {
    throw new Error(
      (!data.success && data.message) || 'Failed to acknowledge What’s New'
    );
  }
  return data.data.lastSeenAppVersion;
}
