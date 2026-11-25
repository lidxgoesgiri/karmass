import { Hono } from 'hono';
import type { OnPostDeleteRequest, TriggerResponse } from '@devvit/web/shared';
import { publishDaily } from '../core/postScheduler';
import { clearLeaderboard, editionForPost } from '../services/hivemindRedis';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await publishDaily();
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: post
          ? `Published edition #${post.n}`
          : 'Edition already published today',
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create post' },
      400
    );
  }
});

// Deleting a Karmass post removes its user-identifying leaderboard data.
triggers.post('/on-post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>().catch(() => null);
  const n = input?.postId ? await editionForPost(input.postId) : null;
  if (n) await clearLeaderboard(n);
  return c.json<TriggerResponse>(
    { status: 'success', message: n ? `Cleared #${n}` : 'Not a Karmass post' },
    200
  );
});
