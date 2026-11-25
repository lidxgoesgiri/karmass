import { showToast } from '@devvit/web/client';
import type { Attempt, Session } from '../shared/types';

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const request = async <T>(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new ApiFailure(
        typeof data?.error === 'string'
          ? data.error
          : `Request failed (${res.status})`,
        res.status
      );
    return data;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('Connection hiccup. Please try again.', 0);
  } finally {
    clearTimeout(timer);
  }
};

export const apiGet = <T>(path: string, timeoutMs = 8000) =>
  request<T>(path, { method: 'GET' }, timeoutMs);

export const apiPost = <T>(path: string, body: unknown, timeoutMs = 8000) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);

export const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : 'Something went wrong.';

// showToast only exists inside Reddit; local previews just log.
export const notify = (text: string): void => {
  try {
    showToast(text);
  } catch {
    console.info(`[toast] ${text}`);
  }
};

export const revealedFrom = (session: Session): Record<string, number> => {
  if (session.final) return session.final.percents;
  const out: Record<string, number> = {};
  session.attempts.forEach((a: Attempt) => {
    out[a.left] = a.leftPct;
    out[a.right] = a.rightPct;
  });
  return out;
};

export const pad3 = (n: number): string => String(n).padStart(3, '0');
