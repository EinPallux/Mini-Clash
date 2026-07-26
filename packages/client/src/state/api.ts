/**
 * The client's half of the platform api (TECH §9).
 *
 * Everything goes through one `request()` so three rules hold everywhere
 * without anybody remembering them:
 *
 * - **Same origin.** `/api` is proxied to the service in dev and by Caddy in
 *   production, so the session cookie is first-party in both and there is no
 *   CORS story to get wrong.
 * - **The cookie is never read by JavaScript.** It is httpOnly; the only thing
 *   this module holds is the CSRF token, which is what mutating calls echo.
 * - **A network failure is not an error state.** It is `offline`, and the game
 *   keeps working — Training and vs-bots need no account at all.
 */

const BASE = ((): string => {
  const override = new URLSearchParams(window.location.search).get('api');
  if (override) return override.replace(/\/+$/, '');
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env?.VITE_API_URL) return env.VITE_API_URL.replace(/\/+$/, '');
  return '/api';
})();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/** The api could not be reached at all — a different thing from it saying no. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

let csrf: string | null = null;

export function setCsrf(token: string | null): void {
  csrf = token;
}

export function hasCsrf(): boolean {
  return csrf !== null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Sent as `Idempotency-Key` — makes a retried purchase charge once. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch {
    throw new OfflineError();
  }

  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const body = (payload ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, body.error ?? 'request_failed', body.message);
  }
  return payload as T;
}

/**
 * A stable per-browser credential for guest play.
 *
 * Generated once and kept in local storage. It is a credential, so it is only
 * ever sent in a request body — never in a URL, where it would end up in logs
 * and in whatever the player pastes to a friend.
 */
export function deviceKey(): string {
  const KEY = 'mc.device';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 16) return existing;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY, key);
    return key;
  } catch {
    // Private mode with storage blocked: a per-session key still lets this
    // browser play, it just will not be recognised on the next visit.
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
