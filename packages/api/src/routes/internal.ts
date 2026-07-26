import { randomUUID } from 'node:crypto';
import {
  type MatchResultPayload,
  makeTicket,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequest,
} from '@mini-clash/protocol';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dto } from '../app';
import { championsFor } from '../economy';
import { ApiError } from '../errors';
import { recordMatch } from '../matches';

/**
 * The service boundary (TECH §9–§10).
 *
 * `/play/ticket` is called by a signed-in player; `/internal/*` is called only
 * by the game server, authenticated with the shared secret rather than a
 * cookie. The distinction matters: `/internal/match-result` is the single door
 * through which coins can be created, so it must be unreachable from a browser
 * no matter what a browser sends.
 *
 * With no secret configured the internal route answers 503 rather than running
 * unauthenticated. A misconfigured deploy should refuse to pay out, not pay out
 * to anyone who asks.
 */

/** How long a play ticket is good for — long enough to load, short enough to matter. */
const TICKET_TTL_SECONDS = 120;

const TicketRequest = z.object({ mode: z.string().min(1).max(32).optional() });

export function internalSecret(): string | null {
  const secret = process.env.MC_INTERNAL_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export async function playRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Mint a room ticket.
   *
   * The entitlements snapshot travels *inside* the signature, so the game
   * server can refuse a champion the player does not own without asking the api
   * again mid-join — and a client editing the list invalidates it.
   */
  app.post('/play/ticket', async (req) => {
    const s = req.session;
    if (!s) throw new ApiError(401, 'no_session');
    const secret = internalSecret();
    if (!secret) throw new ApiError(503, 'no_service_secret');
    const body = dto(TicketRequest, req.body ?? {});

    const catalog = await championsFor(app.db, s.user.id, new Date());
    const champions = catalog.champions.filter((c) => c.playable).map((c) => c.id);
    const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
    const ticket = await makeTicket(secret, {
      sub: s.user.id,
      name: s.user.name,
      mode: body.mode ?? 'bridge',
      champions,
      exp,
      jti: randomUUID(),
    });
    return { ticket, expiresAt: new Date(exp * 1000).toISOString(), champions };
  });
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  // Encapsulated to this plugin: the handler below receives the body as the
  // exact string that arrived. Re-encoding the parsed object would not
  // reproduce it — key order and number formatting both differ — and the
  // signature is over bytes, not over meaning.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  /** The game server reporting a finished match. */
  app.post(
    '/internal/match-result',
    { config: { public: true, rateLimit: false } },
    async (req) => {
      const secret = internalSecret();
      if (!secret) throw new ApiError(503, 'no_service_secret');

      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const failure = await verifyRequest(
        secret,
        raw,
        header(req.headers[SIGNATURE_HEADER]),
        header(req.headers[TIMESTAMP_HEADER]),
        Math.floor(Date.now() / 1000),
      );
      if (failure) {
        req.log.warn({ failure, ip: req.ip }, 'rejected internal request');
        throw new ApiError(401, failure);
      }

      let payload: MatchResultPayload;
      try {
        payload = JSON.parse(raw) as MatchResultPayload;
      } catch {
        throw new ApiError(400, 'bad_json');
      }
      const result = await recordMatch(app.db, payload, new Date());
      if (!result.duplicate) {
        req.log.info({ matchId: result.matchId, paid: result.awards.length }, 'match recorded');
      }
      return result;
    },
  );
}

const header = (v: string | string[] | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;
