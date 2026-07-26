import type { Team } from '@mini-clash/data';
import type { BotTier } from './index';

/**
 * The contract between the game server and the platform api (TECH §9–§10).
 *
 * Two messages cross that boundary and both are signed with a shared secret,
 * because the api is the only writer of coins and the game server is the only
 * thing allowed to say a match happened:
 *
 * - **`/play/ticket`** — the api mints a short-lived ticket naming a player and
 *   what they are entitled to field. The game server trusts the ticket, never
 *   the client, so a browser cannot claim someone else's identity or a champion
 *   it does not own.
 * - **`/internal/match-result`** — the game server reports a finished match. The
 *   api recomputes every reward from its own tables; the payload says what
 *   *happened*, never what anybody should be *paid*.
 *
 * Signing lives here, in the one package both sides already share, so there is
 * a single implementation rather than two that can drift. It uses Web Crypto
 * rather than `node:crypto` to keep this package free of Node imports.
 */

/* ------------------------------ Match result ------------------------------ */

export interface MatchSeatStats {
  kills: number;
  deaths: number;
  assists: number;
  /** Damage dealt to enemy champions. */
  damage: number;
  gold: number;
  level: number;
  /** Team-credited: towers this seat's side destroyed (see quests). */
  towers: number;
  /** Team-credited: golems this seat's side converted. */
  golems: number;
  swaps: number;
}

export interface MatchResultSeat {
  seat: number;
  /** Null for a bot seat — the scoreboard keeps all eight either way. */
  userId: string | null;
  botTier: BotTier | null;
  team: Team;
  won: boolean;
  /** Both halves of the duo, active first. */
  duo: string[];
  stats: MatchSeatStats;
  augments: string[];
  /**
   * 0…1 share of this seat's contribution to its team, used for the reward
   * swing. Computed by the game server from the same numbers the scoreboard
   * shows, so a player can always see why a match paid what it did.
   */
  performance: number;
}

export interface MatchResultPayload {
  /** Stable id; re-posting the same one is a no-op, not a second payout. */
  matchId: string;
  mode: string;
  seed: number;
  /** ISO-8601. */
  startedAt: string;
  /** Seconds of match time. */
  duration: number;
  /** The summary blob the history detail view replays verbatim. */
  result: unknown;
  seats: MatchResultSeat[];
}

/* -------------------------------- Tickets --------------------------------- */

export interface PlayTicketClaims {
  /** User id. */
  sub: string;
  name: string;
  mode: string;
  /** Champion ids this player may field — owned plus this week's rotation. */
  champions: string[];
  /** Unix seconds. */
  exp: number;
  /** Unique per ticket, so one cannot be replayed into two seats. */
  jti: string;
}

/* --------------------------------- Crypto --------------------------------- */

const enc = new TextEncoder();

/** Derived rather than named: `CryptoKey` needs the DOM lib, which this package does not take. */
type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function keyFor(secret: string): Promise<HmacKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare — no early exit on the first wrong character. */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------ Request signing --------------------------- */

export const SIGNATURE_HEADER = 'x-mc-signature';
export const TIMESTAMP_HEADER = 'x-mc-timestamp';
/** How far a signed request's clock may be out before we refuse it. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

/** The bytes actually signed: timestamp and body together, so neither can be swapped. */
const signedText = (timestamp: string, body: string): string => `${timestamp}.${body}`;

export async function signRequest(
  secret: string,
  body: string,
  nowSeconds: number,
): Promise<{ [SIGNATURE_HEADER]: string; [TIMESTAMP_HEADER]: string }> {
  const timestamp = String(Math.floor(nowSeconds));
  return {
    [SIGNATURE_HEADER]: await hmacHex(secret, signedText(timestamp, body)),
    [TIMESTAMP_HEADER]: timestamp,
  };
}

export type VerifyFailure = 'no_signature' | 'stale' | 'bad_signature';

/**
 * Check a signed request. The timestamp is inside the signature *and* checked
 * for freshness: without the freshness check a captured request would stay
 * valid forever, and without covering it by the signature an attacker could
 * simply rewrite it.
 */
export async function verifyRequest(
  secret: string,
  body: string,
  signature: string | undefined,
  timestamp: string | undefined,
  nowSeconds: number,
): Promise<VerifyFailure | null> {
  if (!signature || !timestamp) return 'no_signature';
  const at = Number(timestamp);
  if (!Number.isFinite(at) || Math.abs(nowSeconds - at) > MAX_CLOCK_SKEW_SECONDS) return 'stale';
  const expected = await hmacHex(secret, signedText(timestamp, body));
  return safeCompare(expected, signature) ? null : 'bad_signature';
}

/* --------------------------------- Tickets -------------------------------- */

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function makeTicket(secret: string, claims: PlayTicketClaims): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return `${payload}.${await hmacHex(secret, payload)}`;
}

/**
 * Read a ticket, or null if it is forged, malformed or expired.
 *
 * One function with one return type: a caller cannot accidentally use the
 * claims from a ticket that failed to verify, because there are none to use.
 */
export async function readTicket(
  secret: string,
  ticket: string,
  nowSeconds: number,
): Promise<PlayTicketClaims | null> {
  const dot = ticket.indexOf('.');
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const signature = ticket.slice(dot + 1);
  const expected = await hmacHex(secret, payload);
  if (!safeCompare(expected, signature)) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as PlayTicketClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp < nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}
