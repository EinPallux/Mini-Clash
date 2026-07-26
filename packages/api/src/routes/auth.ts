import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dto, sessionBody, setSessionCookie } from '../app';
import {
  deleteAccount,
  guest,
  login,
  logout,
  rename,
  renameQuote,
  revokeOtherSessions,
  sessionFor,
  upgrade,
} from '../auth';
import { ApiError } from '../errors';

/**
 * `/auth/*` (TECH §9).
 *
 * `GET /auth/me` answers `{ user: null }` with a 200 rather than a 401: at boot
 * the client is *asking* who it is, and "nobody yet" is a real answer, not an
 * error. Treating it as one is how apps end up flashing an error toast on a
 * first visit.
 */

const Guest = z.object({
  name: z.string().min(1).max(64),
  deviceKey: z.string().min(16).max(128),
});
const Credentials = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(256),
});
const Rename = z.object({ name: z.string().min(1).max(64) });
const Delete = z.object({ confirm: z.string() });

/** Brute-force budgets, tighter than the global cap (TECH §10). */
const SLOW = { rateLimit: { max: 10, timeWindow: '5 minutes' } };
const SIGNUP = { rateLimit: { max: 20, timeWindow: '1 hour' } };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', async (req) => {
    if (!req.session) return { user: null, csrf: null };
    const quote = await renameQuote(app.db, req.session.user.id);
    return { ...sessionBody(req.session), renamePrice: quote };
  });

  app.post('/guest', { config: { public: true, ...SIGNUP } }, async (req, reply) => {
    const body = dto(Guest, req.body);
    const s = await guest(app.db, body.name, body.deviceKey);
    setSessionCookie(reply, s.token);
    return sessionBody(s);
  });

  app.post('/login', { config: { public: true, ...SLOW } }, async (req, reply) => {
    const body = dto(Credentials, req.body);
    const s = await login(app.db, body.email, body.password);
    setSessionCookie(reply, s.token);
    return sessionBody(s);
  });

  /** Attach an email to the account already in play — same row, same progress. */
  app.post('/upgrade', { config: SLOW }, async (req) => {
    const s = req.session;
    if (!s) throw new ApiError(401, 'no_session');
    const body = dto(Credentials, req.body);
    await upgrade(app.db, s.user.id, body.email, body.password);
    const fresh = await sessionFor(app.db, s.token);
    if (!fresh) throw new ApiError(401, 'no_session');
    return sessionBody(fresh);
  });

  app.post('/logout', async (req, reply) => {
    await logout(app.db, req.session?.token);
    setSessionCookie(reply, null);
    return { ok: true };
  });

  /** "Sign out everywhere" — for the machine you no longer have access to. */
  app.post('/logout-others', async (req) => {
    const s = req.session;
    if (!s) throw new ApiError(401, 'no_session');
    await revokeOtherSessions(app.db, s.user.id, s.token);
    return { ok: true };
  });

  app.post('/rename', async (req) => {
    const s = req.session;
    if (!s) throw new ApiError(401, 'no_session');
    const body = dto(Rename, req.body);
    const result = await rename(app.db, s.user.id, body.name);
    return result;
  });

  /**
   * Deleting is permanent, so it asks for the account name back (UI_UX §13's
   * confirm phrase) — a mis-click cannot reach it, only a decision can.
   */
  app.post('/delete', async (req, reply) => {
    const s = req.session;
    if (!s) throw new ApiError(401, 'no_session');
    const body = dto(Delete, req.body);
    if (body.confirm.trim() !== s.user.name) throw new ApiError(400, 'confirm_mismatch');
    await deleteAccount(app.db, s.user.id);
    setSessionCookie(reply, null);
    return { ok: true };
  });
}
