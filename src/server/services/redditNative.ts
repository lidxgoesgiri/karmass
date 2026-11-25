// Thin wrappers over Devvit's Reddit API. Every call here is best-effort: a Reddit hiccup must
// never fail a game request.
import { context, reddit } from '@devvit/web/server';
import { blankPrompt, editionFor, postTitle } from '../core/editions';

const STICKY_TEXT = [
  '**Share your Karmass result here.**',
  '',
  'Finish today’s edition and tap **Share result** to post a spoiler-free summary as a reply to this comment.',
  '',
  'Please keep the winning words out of the thread until tomorrow’s edition drops.',
  '',
  '**Got a prompt idea?** Reply with a sentence that has two blanks (for example, *The two best smells are [A] and [B]*) plus six options. Community favorites join future editions with credit: *Prompt by u/you*.',
].join('\n');

export const snoovatarFor = async (
  username: string
): Promise<string | null> => {
  try {
    return (await reddit.getSnoovatarUrl(username)) ?? null;
  } catch (error) {
    console.error('getSnoovatarUrl failed', error);
    return null;
  }
};

export const applyFlair = async (
  username: string,
  text: string
): Promise<void> => {
  if (!context.subredditName) return;
  try {
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username,
      text,
    });
  } catch (error) {
    console.error('setUserFlair failed', error);
  }
};

export const clearFlair = async (username: string): Promise<void> => {
  if (!context.subredditName) return;
  try {
    await reddit.removeUserFlair(context.subredditName, username);
  } catch (error) {
    console.error('removeUserFlair failed', error);
  }
};

// Posts as the user (asUser: SUBMIT_COMMENT). Until the app version is approved Reddit posts it from
// the app account; if the USER call is rejected outright we post from the app with clear attribution.
export const postShareComment = async (
  targetId: `t1_${string}` | `t3_${string}`,
  text: string,
  username: string
): Promise<void> => {
  try {
    await reddit.submitComment({ id: targetId, text, runAs: 'USER' });
  } catch (error) {
    console.error('USER comment failed, falling back to APP', error);
    await reddit.submitComment({
      id: targetId,
      text: `*Shared by u/${username}*\n\n${text}`,
      runAs: 'APP',
    });
  }
};

export const createEditionPost = async (
  n: number,
  date: string
): Promise<{
  postId: `t3_${string}`;
  stickyId: string | null;
  permalink: string;
}> => {
  const post = await reddit.submitCustomPost({
    title: postTitle(n),
    postData: { edition: n, date },
    textFallback: {
      text: `${blankPrompt(editionFor(n).prompt)}\n\nOpen this post in the Reddit app or on reddit.com to play Karmass.`,
    },
  });
  let stickyId: string | null = null;
  try {
    const sticky = await reddit.submitComment({
      id: post.id,
      text: STICKY_TEXT,
    });
    await sticky.distinguish(true);
    stickyId = sticky.id;
  } catch (error) {
    console.error(
      'Sticky comment failed; shares will reply to the post',
      error
    );
  }
  return { postId: post.id, stickyId, permalink: post.permalink };
};
