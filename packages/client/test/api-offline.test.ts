import { afterEach, describe, expect, it } from 'vitest';

/**
 * Telling "the api is down" apart from "the api said no" (TECH §9).
 *
 * The distinction is the whole reason Training Grounds and vs-bots stay
 * playable when the platform is not there. It is easy to get right for a failed
 * socket and easy to get wrong for everything else: in production `/api` sits
 * behind Caddy, and a proxy whose upstream is down answers the request *itself*
 * with a 502. The fetch succeeds. Only the status says anything is wrong.
 *
 * Get that backwards and a restarting api becomes a wall at the name screen for
 * modes that never needed an account.
 */

// `BASE` is computed once, at import time, from window.location.search — so the
// global has to exist before the module is pulled in.
Object.defineProperty(globalThis, 'window', {
  value: { location: { search: '' } },
  writable: true,
  configurable: true,
});

const { request, ApiError, OfflineError } = await import('../src/state/api');

/** A Response as far as request() is concerned. */
function reply(status: number, body: unknown | 'not-json'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === 'not-json') throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
  } as Response;
}

function answering(res: Response | (() => never)): void {
  Object.defineProperty(globalThis, 'fetch', {
    value: async () => (typeof res === 'function' ? res() : res),
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'fetch');
});

describe('the api is unreachable', () => {
  it('a failed socket is offline', async () => {
    answering(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/profile')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a proxy 502 is offline, not an error the player did something about', async () => {
    answering(reply(502, 'not-json'));
    await expect(request('/profile')).rejects.toBeInstanceOf(OfflineError);
  });

  it('503 and 504 are offline too', async () => {
    for (const status of [503, 504]) {
      answering(reply(status, 'not-json'));
      await expect(request('/profile')).rejects.toBeInstanceOf(OfflineError);
    }
  });

  it('a gateway that answers JSON is still a gateway', async () => {
    answering(reply(502, { error: 'upstream_unavailable' }));
    await expect(request('/profile')).rejects.toBeInstanceOf(OfflineError);
  });

  it('any 5xx with no JSON body was not written by the api', async () => {
    // Vite's dev proxy answers 500 with a plain-text body when the api is not
    // listening, which is the same situation with a different number on it.
    answering(reply(500, 'not-json'));
    await expect(request('/profile')).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('the api answered', () => {
  it('its own 500 stays an error — it says so in JSON', async () => {
    answering(reply(500, { error: 'internal' }));
    const err = await request('/profile').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('internal');
  });

  it('a refusal keeps its code, so the screen can explain it', async () => {
    answering(reply(400, { error: 'bad_name', message: 'no' }));
    const err = await request('/auth/guest', { method: 'POST' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('bad_name');
  });

  it('rate limiting is a refusal, not an outage', async () => {
    answering(reply(429, { error: 'rate_limited' }));
    const err = await request('/auth/guest', { method: 'POST' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
  });

  it('204 resolves to nothing rather than failing to parse', async () => {
    answering(reply(204, 'not-json'));
    await expect(request('/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
