import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import { checkCsrf, SESSION_COOKIE, SESSION_MAX_AGE, type Session, sessionFor } from './auth';
import { migrate, openDb, type Sql } from './db';
import { ApiError } from './errors';
import { log } from './log';
import { authRoutes } from './routes/auth';
import { hubRoutes } from './routes/hub';
import { internalRoutes, playRoutes } from './routes/internal';

/**
 * The Fastify app (TECH §9–§10).
 *
 * Three cross-cutting rules live here rather than in each route, because a rule
 * you have to remember to apply is a rule you will eventually forget:
 *
 * 1. **Every request resolves its session once**, from an httpOnly cookie. The
 *    lookup hits the database rather than trusting a signed blob, so logging
 *    out — or deleting an account — takes effect on the very next request.
 * 2. **Every mutating request needs a session and a CSRF token**, unless the
 *    route opts out by declaring itself public (only sign-in can, since it is
 *    what hands the token out). SameSite=Lax already stops the cross-site POST;
 *    the token is the second lock.
 * 3. **Every error is an `ApiError` or becomes a 500.** Routes throw; nothing
 *    hand-rolls a status code, and an unexpected exception never leaks a stack
 *    trace or a SQL string to the client.
 */

declare module 'fastify' {
  interface FastifyInstance {
    db: Sql;
  }
  interface FastifyRequest {
    session: Session | null;
  }
}

export interface AppOptions {
  db?: Sql;
  /** Run migrations on boot. Off for tests, which migrate once themselves. */
  migrateOnBoot?: boolean;
  /** Silence request logging — tests assert on responses, not on stdout. */
  quiet?: boolean;
}

/** Routes that create a session cannot require one; they say so out loud. */
export interface RouteConfig {
  public?: boolean;
}

const PRODUCTION = process.env.NODE_ENV === 'production';

/** Attach (or clear) the session cookie. */
export function setSessionCookie(reply: FastifyReply, token: string | null): void {
  if (token === null) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return;
  }
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

/** Validate a body, turning a zod failure into a 400 the client can read. */
export function dto<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0];
      throw new ApiError(
        400,
        'bad_request',
        first ? `${first.path.join('.')}: ${first.message}` : 'invalid body',
      );
    }
    throw e;
  }
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Cast to the base type so the instance stays a plain `FastifyInstance`;
    // carrying pino's concrete generic through every route signature buys
    // nothing and infects every module that touches the app.
    loggerInstance: (opts.quiet
      ? log.child({}, { level: 'silent' })
      : log) as unknown as FastifyBaseLogger,
    // Behind Caddy: trust exactly one hop, so rate limits key on the real
    // client address without letting a client forge its own X-Forwarded-For.
    trustProxy: Number(process.env.TRUST_PROXY ?? 1),
    bodyLimit: 64 * 1024,
  });

  const db = opts.db ?? (await openDb());
  if (opts.migrateOnBoot !== false && !opts.db) {
    const applied = await migrate(db);
    if (applied.length) log.info({ applied }, 'migrations applied');
  }
  app.decorate('db', db);
  app.decorateRequest('session', null);

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // A guest has no user id yet, so the address is the only stable key. Behind
    // the proxy `req.ip` is the forwarded one (see trustProxy above).
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({ error: 'rate_limited' }),
  });

  app.addHook('preHandler', async (req) => {
    req.session = await sessionFor(app.db, req.cookies[SESSION_COOKIE]);
    const cfg = (req.routeOptions?.config ?? {}) as RouteConfig;
    const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (mutating && !cfg.public) {
      if (!req.session) throw new ApiError(401, 'no_session');
      const header = req.headers['x-csrf-token'];
      checkCsrf(req.session, typeof header === 'string' ? header : undefined);
    }
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      reply.status(err.status).send({ error: err.code, message: err.message });
      return;
    }
    // Fastify's own 4xx (415 unsupported media type, malformed JSON) are the
    // caller's fault and safe to pass through by code alone.
    const fst = err as { statusCode?: number; code?: string };
    const status = typeof fst.statusCode === 'number' ? fst.statusCode : 500;
    if (status < 500) {
      reply.status(status).send({ error: fst.code ?? 'bad_request' });
      return;
    }
    req.log.error({ err }, 'unhandled');
    reply.status(500).send({ error: 'internal' });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'not_found' });
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    ok: true,
    uptime: process.uptime(),
  }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(hubRoutes);
  await app.register(playRoutes);
  // Registered last and in its own scope: it swaps the JSON parser for one that
  // preserves the raw body, and that must not leak into any other route.
  await app.register(internalRoutes);

  return app;
}

/** The shape every route returns for "who is this" — the client's single truth. */
export function sessionBody(s: Session): {
  user: Session['user'];
  csrf: string;
} {
  return { user: s.user, csrf: s.csrf };
}
