export class ApiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export async function apiRequest(path, { onUnauthorized, errorMessage, ...options } = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  const requestOptions = {
    credentials: 'include',
    ...options,
  };
  if (Object.keys(headers).length > 0) {
    requestOptions.headers = headers;
  }

  const res = await fetch(path, {
    ...requestOptions,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    return null;
  }

  if (!res.ok) {
    const message = typeof errorMessage === 'function'
      ? errorMessage(res.status)
      : errorMessage ?? `request failed: ${res.status}`;
    throw new ApiError(message, { status: res.status });
  }

  return res.json();
}
