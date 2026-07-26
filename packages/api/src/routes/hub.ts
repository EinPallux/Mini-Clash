import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { dto } from '../app';
import type { Session } from '../auth';
import {
  championsFor,
  claimMastery,
  masteryFor,
  profileFor,
  purchase,
  setBanner,
  setSettings,
  setShowcase,
  unlocksFor,
} from '../economy';
import { ApiError } from '../errors';
import { historyFor, lifetimeStats, matchDetail } from '../history';
import { claimQuest, questsFor, rerollQuest } from '../quests';

/**
 * The hub's read/write surface (TECH §9, UI_UX §13).
 *
 * `/champions` is the one endpoint that answers without a session — the
 * catalog is public, and a logged-out visitor browsing champions should see
 * prices and the free rotation rather than a wall. Everything else is personal.
 */

const Purchase = z.object({
  kind: z.enum(['champion', 'palette', 'sticker', 'pose']),
  refId: z.string().min(1).max(64),
});
const QuestId = z.object({ questId: z.string().min(1).max(64) });
const ChampionId = z.object({ championId: z.string().min(1).max(64) });
const Settings = z.object({ settings: z.record(z.string(), z.unknown()) });
const Showcase = z.object({ showcase: z.array(z.string().min(1).max(64)).max(3) });
const Banner = z.object({ bannerId: z.string().min(1).max(48) });

/** Every personal route needs a player; this is the one place that check lives. */
function must(req: FastifyRequest): Session {
  if (!req.session) throw new ApiError(401, 'no_session');
  return req.session;
}

export async function hubRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------ Profile -------------------------------- */

  app.get('/profile', async (req) => {
    const s = must(req);
    const [profile, unlocks, mastery, lifetime] = await Promise.all([
      profileFor(app.db, s.user.id),
      unlocksFor(app.db, s.user.id),
      masteryFor(app.db, s.user.id),
      lifetimeStats(app.db, s.user.id),
    ]);
    return { user: s.user, profile, unlocks, mastery, lifetime };
  });

  app.put('/profile/settings', async (req) => {
    const s = must(req);
    const body = dto(Settings, req.body);
    await setSettings(app.db, s.user.id, body.settings);
    return { ok: true };
  });

  app.put('/profile/showcase', async (req) => {
    const s = must(req);
    const body = dto(Showcase, req.body);
    return { showcase: await setShowcase(app.db, s.user.id, body.showcase) };
  });

  app.put('/profile/banner', async (req) => {
    const s = must(req);
    const body = dto(Banner, req.body);
    await setBanner(app.db, s.user.id, body.bannerId);
    return { ok: true };
  });

  /* ----------------------------- Champions ------------------------------- */

  app.get('/champions', async (req) => {
    // Public: prices and the rotation are the pitch, not a members-only page.
    return championsFor(app.db, req.session?.user.id ?? null, new Date());
  });

  /* -------------------------------- Shop --------------------------------- */

  app.post('/shop/purchase', async (req) => {
    const s = must(req);
    const body = dto(Purchase, req.body);
    const header = req.headers['idempotency-key'];
    const idemKey = typeof header === 'string' && header.length <= 128 ? header : undefined;
    return purchase(app.db, s.user.id, body.kind, body.refId, idemKey);
  });

  /* ------------------------------- Quests -------------------------------- */

  app.get('/quests', async (req) => questsFor(app.db, must(req).user.id, new Date()));

  app.post('/quests/claim', async (req) => {
    const s = must(req);
    const body = dto(QuestId, req.body);
    return claimQuest(app.db, s.user.id, body.questId, new Date());
  });

  app.post('/quests/reroll', async (req) => {
    const s = must(req);
    const body = dto(QuestId, req.body);
    return { quest: await rerollQuest(app.db, s.user.id, body.questId, new Date()) };
  });

  app.post('/mastery/claim', async (req) => {
    const s = must(req);
    const body = dto(ChampionId, req.body);
    return claimMastery(app.db, s.user.id, body.championId);
  });

  /* ------------------------------- History ------------------------------- */

  app.get('/history', async (req) => {
    const s = must(req);
    const q = req.query as { limit?: string; before?: string };
    const limit = q.limit ? Number(q.limit) : 30;
    return { matches: await historyFor(app.db, s.user.id, limit, q.before) };
  });

  app.get('/history/:matchId', async (req) => {
    const s = must(req);
    const { matchId } = req.params as { matchId: string };
    return matchDetail(app.db, s.user.id, matchId);
  });
}
