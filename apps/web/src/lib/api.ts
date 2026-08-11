import type { AuthUser, ApiResponse } from '@worknest/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const ACCESS_KEY = 'worknest_access_token';
const REFRESH_KEY = 'worknest_refresh_token';

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const json = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
  if (!json.success) {
    clearTokens();
    return null;
  }

  setTokens(json.data.accessToken, json.data.refreshToken);
  return json.data.accessToken;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options;
  const url = new URL(`${API_URL}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    const error = !json.success
      ? json.error
      : { code: 'REQUEST_FAILED', message: 'Request failed', details: undefined };
    throw new ApiClientError(res.status, error.code, error.message, error.details);
  }

  return json.data;
}

export async function login(email: string, password: string) {
  const data = await apiRequest<{
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: { refreshToken: getRefreshToken() },
    });
  } finally {
    clearTokens();
  }
}

export async function fetchMe() {
  return apiRequest<AuthUser>('/auth/me');
}

export function hasPermission(user: AuthUser | null | undefined, permission: string) {
  return Boolean(user?.permissions.includes(permission));
}
