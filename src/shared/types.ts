// Client-server contracts. Server-only fields (seedVotes, live counts) never leave the server
// before a valid DROP.

export type Theme = 'Relatable Habits' | 'Internet & Tech' | 'Reddit Classics';

export type EditionOption = {
  id: string;
  label: string;
  seedVotes: number;
};

export type Edition = {
  number: number;
  theme: Theme;
  prompt: string; // contains the literal tokens {A} and {B}
  options: EditionOption[];
  credit?: string; // Reddit username of the community member who suggested the prompt
};

export type PublicOption = { id: string; label: string };

export type PublicEdition = {
  number: number;
  theme: Theme;
  prompt: string;
  date: string; // UTC YYYY-MM-DD the edition went live
  credit?: string;
  options: PublicOption[]; // display order is shuffled server-side
};

export type Mode = 'live' | 'archive';

export type Attempt = {
  left: string;
  right: string;
  leftPct: number;
  rightPct: number;
  delta: number;
  balanced: boolean;
};

export type Final = {
  won: boolean;
  score: number | null;
  percents: Record<string, number>;
  voters: number; // real votes when the session ended (excludes the 100 starter votes)
  at: number;
};

export type Session = {
  vote: string | null;
  attempts: Attempt[];
  final: Final | null;
  shared: boolean;
};

export type Player = {
  loggedIn: boolean;
  username: string | null;
  snoovatar: string | null;
  streak: number;
  bestStreak: number;
  flairEnabled: boolean;
  flair: string | null;
};

export type GameState = {
  edition: PublicEdition;
  mode: Mode;
  voters: number;
  session: Session;
  player: Player;
  nextEditionAt: number; // epoch ms of the next UTC midnight
};

export type VoteRequest = { edition: number; optionId: string };
export type DropRequest = { edition: number; left: string; right: string };
export type ShareRequest = { edition: number };
export type FlairRequest = { enabled: boolean };

export type DropResponse = {
  attempt: Attempt;
  session: Session;
  player: Player;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  snoovatar: string | null;
  score: number;
  delta: number;
  attempts: number;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  total: number;
};

export type ArchiveEntry = {
  number: number;
  date: string;
  prompt: string;
  live: boolean;
};

export type SplashData = {
  edition: number;
  date: string;
  prompt: string;
  mode: Mode;
  voters: number;
  finished: boolean;
  won: boolean;
  streak: number;
  username: string | null;
};

// Practice rounds use past editions only; their final weights are public, so the client
// evaluates drops locally and nothing is stored.
export type PracticeRound = {
  edition: PublicEdition;
  percents: Record<string, number>;
};

export type ApiError = { error: string };
