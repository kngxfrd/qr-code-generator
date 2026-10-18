type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

function readCookie(name: string) {
  return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

async function ensureCsrf() {
  if (!readCookie('csrftoken')) await fetch('/api/csrf/', { credentials: 'same-origin' });
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) await ensureCsrf();
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) headers.set('X-CSRFToken', decodeURIComponent(readCookie('csrftoken')));
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const data = contentType.includes('json') ? await response.json().catch(() => ({})) : {};
    throw new Error(data.error || data.detail || `Request failed (${response.status}).`);
  }
  if (contentType.includes('application/json')) return response.json() as Promise<T>;
  return response as T;
}

export async function getBlob(path: string) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return response.blob();
}
