import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { utcDate } from '../core/game';
import { isDailyPublished } from '../services/hivemindRedis';

export const menu = new Hono();

// Moderator tool: asks for confirmation first so a stray click never doubles today's edition.
menu.post('/post-create', async (c) => {
  const today = utcDate(Date.now());
  const already = await isDailyPublished(today);
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'publishEdition',
        form: {
          title: 'Publish next Karmass edition',
          description: already
            ? `Today's edition (${today} UTC) is already live. Publishing now adds another live edition for today.`
            : `No edition has been published for ${today} UTC yet.`,
          fields: [
            {
              type: 'boolean',
              name: 'confirm',
              label: 'Yes, publish the next edition now',
              defaultValue: false,
            },
          ],
          acceptLabel: 'Publish',
        },
      },
    },
    200
  );
});
