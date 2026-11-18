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
  /** Version numbers/names for client-side list search */
  VersionLabels?: string[];
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
  CreatedVia?: string | null;
  WizardProjectIds?: string | null;
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

export type ProductReleaseWizardApplicationPayload = {
  applicationId: number;
  mode: 'create' | 'link';
  versionNumber?: string | null;
  versionName?: string | null;
  applicationVersionId?: number | null;
  /** When linking, replace the application version PatchNotes from wizard tasks. Default false. */
  recreatePatchNotes?: boolean;
  taskIds: number[];
};

export type ProductReleaseWizardPayload = {
  VersionNumber: string;
  VersionName?: string | null;
  Status?: string;
  ReleaseDate?: string | null;
  PatchNotes?: string | null;
  IsCustomerSpecific?: boolean;
  CustomerId?: number | null;
  projectIds?: number[];
  applications: ProductReleaseWizardApplicationPayload[];
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

export type ProductReleaseCandidateTask = {
  Id: number;
  TaskName: string;
  ProjectId: number | null;
  ProjectName: string | null;
  ApplicationId: number | null;
  ReleaseVersionId: number | null;
  StatusName: string | null;
  StatusColor: string | null;
  TaskTypeName?: string | null;
  JiraIssueKey?: string | null;
  ExternalIssueId?: string | null;
  TicketId?: number | null;
  TicketNumber?: string | number | null;
  GitHubIssueNumber?: string | number | null;
  GiteaIssueNumber?: string | number | null;
  JiraUrl?: string | null;
  JiraProjectsUrl?: string | null;
  relatedApplicationIds: number[];
  defaultApplicationIds: number[];
  linkedVersions?: Array<{
    applicationId: number;
    applicationName: string;
    versionId: number;
    versionNumber: string;
  }>;
  LinkedApplicationName?: string | null;
  LinkedVersionNumber?: string | null;
  LinkedAssociationsLabel?: string | null;
  IsLinkedToVersion?: boolean;
};

export async function getProductReleaseCandidateTasks(
  token: string,
  productId: number | string,
  options?: {
    projectIds?: number[];
    includeLinked?: boolean;
    keepSelectedIds?: number[];
  }
) {
  const params = new URLSearchParams();
  if (options?.projectIds && options.projectIds.length > 0) {
    params.set('projectIds', options.projectIds.join(','));
  }
  if (options?.includeLinked) params.set('includeLinked', '1');
  if (options?.keepSelectedIds && options.keepSelectedIds.length > 0) {
    params.set('keepSelectedIds', options.keepSelectedIds.join(','));
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiUrl()}/api/products/${productId}/release-candidate-tasks${qs}`,
    { headers: authHeaders(token) }
  );
  return parseJson<{
    success: boolean;
    data: {
      tasks: ProductReleaseCandidateTask[];
      catalogApplicationIds: number[];
      projectCatalogApplicationIds: number[];
      catalogApplications: Array<{ Id: number; Name: string }>;
    };
  }>(res);
}

export async function getProductReleaseSeedTasks(
  token: string,
  productId: number | string,
  applicationVersionIds: number[]
) {
  const qs =
    applicationVersionIds.length > 0
      ? `?applicationVersionIds=${applicationVersionIds.join(',')}`
      : '';
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/release-seed-tasks${qs}`, {
    headers: authHeaders(token),
  });
  return parseJson<{
    success: boolean;
    data: {
      tasks: Array<{
        taskId: number;
        applicationId: number;
        applicationVersionId: number;
        TaskName: string;
        ProjectId: number | null;
        ProjectName: string | null;
        ApplicationId: number | null;
        TaskTypeName?: string | null;
        JiraIssueKey?: string | null;
        ExternalIssueId?: string | null;
        TicketId?: number | null;
        TicketNumber?: string | number | null;
        GitHubIssueNumber?: string | number | null;
        GiteaIssueNumber?: string | number | null;
        JiraUrl?: string | null;
        JiraProjectsUrl?: string | null;
        PatchNotes?: string | null;
        VersionNumber?: string | null;
        ApplicationName?: string | null;
      }>;
    };
  }>(res);
}

export async function getProductReleaseWizardState(
  token: string,
  productId: number | string,
  versionId: number | string
) {
  const res = await fetch(
    `${getApiUrl()}/api/products/${productId}/versions/${versionId}/release-wizard-state`,
    { headers: authHeaders(token) }
  );
  return parseJson<{
    success: boolean;
    data: {
      version: ProductVersion;
      projectIds: number[];
      applications: Array<{
        applicationId: number;
        included: boolean;
        mode: 'link';
        applicationVersionId: number | null;
        versionNumber: string | null;
        versionName: string | null;
        taskIds: number[];
      }>;
      tasks: Array<{
        taskId: number;
        applicationIds: number[];
        TaskName: string;
        ProjectId: number | null;
        ProjectName: string | null;
        ApplicationId: number | null;
        relatedApplicationIds: number[];
        TaskTypeName?: string | null;
        JiraIssueKey?: string | null;
        ExternalIssueId?: string | null;
        TicketId?: number | null;
        TicketNumber?: string | number | null;
        GitHubIssueNumber?: string | number | null;
        GiteaIssueNumber?: string | number | null;
        JiraUrl?: string | null;
        JiraProjectsUrl?: string | null;
      }>;
    };
  }>(res);
}

export async function createProductReleaseWizard(
  token: string,
  productId: number | string,
  body: ProductReleaseWizardPayload
) {
  const res = await fetch(`${getApiUrl()}/api/products/${productId}/release-wizard`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  return parseJson<{ success: boolean; id: number; message?: string }>(res);
}

export async function updateProductReleaseWizard(
  token: string,
  productId: number | string,
  versionId: number | string,
  body: ProductReleaseWizardPayload
) {
  const res = await fetch(
    `${getApiUrl()}/api/products/${productId}/versions/${versionId}/release-wizard`,
    {
      method: 'PUT',
      headers: authHeaders(token, true),
      body: JSON.stringify(body),
    }
  );
  return parseJson<{ success: boolean; message?: string }>(res);
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
