import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { publishEdition } from '../core/postScheduler';

export const forms = new Hono();

forms.post('/publish-edition', async (c) => {
  const values = await c.req.json<{ confirm?: boolean }>().catch(() => null);
  if (values?.confirm !== true)
    return c.json<UiResponse>({ showToast: 'Nothing published.' }, 200);
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
