import {
  type MatchResultPayload,
  type PlayTicketClaims,
  readTicket,
  signRequest,
} from '@mini-clash/protocol';
import { log } from './log';

/**
 * The game server's half of the service boundary (TECH §9–§10).
 *
 * Two jobs, both about not trusting the client:
 *
 * 1. **Reading tickets.** A join carries an api-signed ticket naming the player
 *    and the champions they may field. The room reads identity from there, never
 *    from what the browser says it is.
 * 2. **Reporting matches.** At match end the server signs the summary and posts
 *    it to the api, which is the only thing that may move coins.
 *
 * With no `MC_INTERNAL_SECRET` the server runs **unlinked**: tickets are not
 * required and results are not reported. That is the local-development and
 * LAN-party mode, and it is loud about itself in the logs — a production box
 * that quietly stopped paying anybody out would be much worse than one that
 * refuses to start.
 */

const RETRIES = 4;
/** 1 s, 2 s, 4 s, 8 s — a restarting api should not cost anybody their match. */
const BACKOFF_MS = 1000;

export function serviceSecret(): string | null {
  const secret = process.env.MC_INTERNAL_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export function apiUrl(): string {
  return (process.env.MC_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

/** True when this server is wired to a platform api at all. */
export function linked(): boolean {
  return serviceSecret() !== null;
}

/** Read a join ticket, or null if it is missing, forged or expired. */
export async function verifyJoinTicket(
  ticket: string | undefined,
): Promise<PlayTicketClaims | null> {
  const secret = serviceSecret();
  if (!secret || !ticket) return null;
  return readTicket(secret, ticket, Math.floor(Date.now() / 1000));
}

/**
 * Report a finished match, retrying through a restart or a blip.
 *
 * Retries are safe by construction: the api keys on `matchId`, so a report that
 * actually landed before the connection dropped is a no-op the second time
 * rather than a double payout.
 */
export async function reportMatch(payload: MatchResultPayload): Promise<boolean> {
  const secret = serviceSecret();
  if (!secret) return false;
  const body = JSON.stringify(payload);
  const url = `${apiUrl()}/internal/match-result`;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const headers = await signRequest(secret, body, Math.floor(Date.now() / 1000));
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const result = (await res.json()) as { duplicate?: boolean; awards?: unknown[] };
        log.info(
          {
            matchId: payload.matchId,
            duplicate: result.duplicate,
            paid: result.awards?.length ?? 0,
          },
          'match reported',
        );
        return true;
      }
      // A 4xx is our fault and will not fix itself; only a 5xx is worth retrying.
      if (res.status < 500) {
        log.error(
          { matchId: payload.matchId, status: res.status, body: await res.text().catch(() => '') },
          'match report rejected',
        );
        return false;
      }
      log.warn({ matchId: payload.matchId, status: res.status, attempt }, 'match report failed');
    } catch (err) {
      log.warn({ matchId: payload.matchId, err, attempt }, 'match report error');
    }
    if (attempt < RETRIES) await sleep(BACKOFF_MS * 2 ** attempt);
  }
  log.error({ matchId: payload.matchId }, 'match report gave up');
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
