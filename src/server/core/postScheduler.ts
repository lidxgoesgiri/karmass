import { utcDate } from './game';
import {
  attachPost,
  claimDailyPost,
  nextEditionNumber,
  releaseEdition,
  returnEditionNumber,
  unclaimDailyPost,
  unreleaseEdition,
} from '../services/hivemindRedis';
import { createEditionPost } from '../services/redditNative';

// Releases the next edition and publishes its interactive post. The edition is released before
// the post exists so the first viewer never sees "edition not found".
export const publishEdition = async (now = Date.now()) => {
  const n = await nextEditionNumber();
  const date = utcDate(now);
  await releaseEdition(n, date);
  try {
    const post = await createEditionPost(n, date);
    await attachPost(n, post.postId, post.stickyId);
    return { n, ...post };
  } catch (error) {
    await unreleaseEdition(n);
    await returnEditionNumber(n); // keep numbering gap-free so no prompt is skipped
    throw error;
  }
};

// Cron + install entry point: at most one automatic edition per UTC day.
export const publishDaily = async (now = Date.now()) => {
  const date = utcDate(now);
  if (!(await claimDailyPost(date))) return null;
  try {
    return await publishEdition(now);
  } catch (error) {
    await unclaimDailyPost(date); // let the next cron run retry today
    throw error;
  }
};
