import { Hono } from 'hono';
import { publishDaily } from '../core/postScheduler';

export const scheduler = new Hono();

// Cron (devvit.json): publishes one edition per UTC day; publishDaily is idempotent per date.
scheduler.post('/daily-post', async (c) => {
  try {
    const post = await publishDaily();
    console.log(
      post ? `Published edition #${post.n}` : 'Daily edition already published'
    );
  } catch (error) {
    console.error('Daily post failed', error);
  }
  return c.json({}, 200);
});
