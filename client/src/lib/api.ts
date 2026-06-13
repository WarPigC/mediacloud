const API = '/api';

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    ...opts,
    credentials: 'include',
    headers: {
      ...(opts?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...opts?.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};

/** Triggers a streamed file download via a hidden link */
export function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = `${API}${url}`;
  a.download = filename;
  a.click();
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
