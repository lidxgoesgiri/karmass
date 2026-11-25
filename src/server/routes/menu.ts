import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { publishEdition } from '../core/postScheduler';

export const menu = new Hono();

// Moderator tool: publishes the next edition immediately (demo posts, missed cron days).
menu.post('/post-create', async (c) => {
  try {
    const post = await publishEdition();
    return c.json<UiResponse>(
      { navigateTo: `https://www.reddit.com${post.permalink}` },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      { showToast: 'Failed to create Karmass post' },
      400
    );
  }
});
