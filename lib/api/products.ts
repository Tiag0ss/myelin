import { getApiUrl } from '@/lib/api/config';

export type ProductCustomer = { Id: number; Name: string; Email?: string };
export type ProductApplication = {
  Id: number;
  Name: string;
  ImagePath?: string | null;
  OrganizationId?: number;
};

export type Product = {
  Id: number;
  Name: string;
  Description: string | null;
  ImagePath?: string | null;
  IsCustomerSpecific: number | boolean;
  OrganizationId: number;
  OrganizationName: string;
  ApplicationCount?: number;
  CustomerCount?: number;
  VersionCount?: number;
  Customers?: ProductCustomer[];
  Applications?: ProductApplication[];
  CreatedAt?: string;
};

export type ProductVersion = {
  Id: number;
  ProductId: number;
  VersionNumber: string;
  VersionName: string | null;
  Status: string;
  ReleaseDate: string | null;
  PatchNotes: string | null;
  IsCustomerSpecific: number | boolean;
  CustomerId?: number | null;
  CustomerName?: string | null;
  LinkedApplicationCount?: number;
  CreatedAt?: string;
  ApplicationVersions?: Array<{
    ApplicationVersionId: number;
    ApplicationId: number;
    ApplicationName: string;
    VersionNumber: string;
    VersionName?: string | null;
    ApplicationVersionStatus?: string;
    ReleaseDate?: string | null;
    PatchNotes?: string | null;
  }>;
};

export type ProductVersionLink = {
  applicationId: number;
  applicationVersionId: number;
};

function authHeaders(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function listProducts(token: string, organizationId?: number | string) {
  const qs = organizationId ? `?organizationId=${organizationId}` : '';
  const res = await fetch(`${getApiUrl()}/api/products${qs}`, {
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; products: Product[] }>(res);
}

export async function getProduct(token: string, id: number | string) {
  const res = await fetch(`${getApiUrl()}/api/products/${id}`, {
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; product: Product }>(res);
}

export async function createProduct(
  token: string,
  body: {
    Name: string;
    Description?: string | null;
    OrganizationId: number;
    IsCustomerSpecific?: boolean;
    customerIds?: number[];
    applicationIds?: number[];
  }
) {
  const res = await fetch(`${getApiUrl()}/api/products`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  return parseJson<{ success: boolean; id: number; message?: string }>(res);
}

export async function updateProduct(
  token: string,
  id: number | string,
  body: { Name: string; Description?: string | null; IsCustomerSpecific?: boolean }
) {
  const res = await fetch(`${getApiUrl()}/api/products/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function deleteProduct(token: string, id: number | string) {
  const res = await fetch(`${getApiUrl()}/api/products/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function setProductApplications(
  token: string,
  id: number | string,
  applicationIds: number[]
) {
  const res = await fetch(`${getApiUrl()}/api/products/${id}/applications`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ applicationIds }),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function setProductCustomers(
  token: string,
  id: number | string,
  customerIds: number[]
) {
  const res = await fetch(`${getApiUrl()}/api/products/${id}/customers`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ customerIds }),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function listProductVersions(token: string, productId: number | string) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions`, {
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; versions: ProductVersion[] }>(res);
}

export async function getProductVersion(
  token: string,
  productId: number | string,
  versionId: number | string
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions/${versionId}`, {
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; version: ProductVersion }>(res);
}

export async function createProductVersion(
  token: string,
  productId: number | string,
  body: {
    VersionNumber: string;
    VersionName?: string | null;
    Status?: string;
    ReleaseDate?: string | null;
    PatchNotes?: string | null;
    IsCustomerSpecific?: boolean;
    CustomerId?: number | null;
    links?: ProductVersionLink[];
  }
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  return parseJson<{ success: boolean; id: number; message?: string }>(res);
}

export async function updateProductVersion(
  token: string,
  productId: number | string,
  versionId: number | string,
  body: {
    VersionNumber: string;
    VersionName?: string | null;
    Status?: string;
    ReleaseDate?: string | null;
    PatchNotes?: string | null;
    IsCustomerSpecific?: boolean;
    CustomerId?: number | null;
  }
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions/${versionId}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function deleteProductVersion(
  token: string,
  productId: number | string,
  versionId: number | string
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions/${versionId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function setProductVersionApplicationVersions(
  token: string,
  productId: number | string,
  versionId: number | string,
  links: ProductVersionLink[]
) {
  const res = await fetch(
    `${getApiUrl()}/api/products/${productId}/versions/${versionId}/application-versions`,
    {
      method: 'PUT',
      headers: authHeaders(token, true),
      body: JSON.stringify({ links }),
    }
  );
  return parseJson<{ success: boolean; message?: string }>(res);
}

export async function rebuildProductVersionPatchNotes(
  token: string,
  productId: number | string,
  versionId: number | string
) {
  const res = await fetch(
    `${getApiUrl()}/api/products/${productId}/versions/${versionId}/rebuild-patch-notes`,
    {
      method: 'POST',
      headers: authHeaders(token),
    }
  );
  return parseJson<{ success: boolean; patchNotes?: string; message?: string }>(res);
}

export async function improveProductPatchNotes(
  token: string,
  productId: number | string,
  patchNotes: string,
  options?: { splitByChangeType?: boolean }
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions/improve-patch-notes`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({
      patchNotes,
      splitByChangeType: Boolean(options?.splitByChangeType),
    }),
  });
  return parseJson<{ success: boolean; patchNotes?: string; message?: string }>(res);
}

export async function getProductsAiAvailability(token: string) {
  const res = await fetch(`${getApiUrl()}/api/products/ai/availability`, {
    headers: authHeaders(token),
  });
  return parseJson<{ success: boolean; configured: boolean; provider?: string }>(res);
}

export async function downloadProductVersionPdf(
  token: string,
  productId: number | string,
  versionId: number | string,
  filename: string
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/versions/${versionId}/pdf`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    let message = 'Failed to download PDF';
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}
