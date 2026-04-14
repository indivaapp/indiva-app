import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Votes {
  [discountId: string]: {
    active: number;
    expired: number;
  };
}

const VOTE_KEY = 'discountVotes';
const USER_VOTES_KEY = 'userVotes';
const EXPIRE_TIMERS_KEY = 'discountExpireTimers';

// Sync wrappers using in-memory cache for synchronous-like access
let votesCache: Votes | null = null;
let userVotesCache: Record<string, 'active' | 'expired'> | null = null;
let expireTimersCache: Record<string, number> | null = null;

export async function loadVotesCache(): Promise<void> {
  try {
    const [votesStr, userVotesStr, timersStr] = await Promise.all([
      AsyncStorage.getItem(VOTE_KEY),
      AsyncStorage.getItem(USER_VOTES_KEY),
      AsyncStorage.getItem(EXPIRE_TIMERS_KEY),
    ]);
    votesCache = votesStr ? JSON.parse(votesStr) : {};
    userVotesCache = userVotesStr ? JSON.parse(userVotesStr) : {};
    expireTimersCache = timersStr ? JSON.parse(timersStr) : {};
  } catch {
    votesCache = {};
    userVotesCache = {};
    expireTimersCache = {};
  }
}

export function getVotes(): Votes {
  return votesCache ?? {};
}

export function getUserVotes(): Record<string, 'active' | 'expired'> {
  return userVotesCache ?? {};
}

export function hasUserVoted(discountId: string): boolean {
  return !!(userVotesCache ?? {})[discountId];
}

export function getUserVoteType(discountId: string): 'active' | 'expired' | null {
  return (userVotesCache ?? {})[discountId] || null;
}

export async function addVote(
  discountId: string,
  voteType: 'active' | 'expired'
): Promise<void> {
  if (hasUserVoted(discountId)) return;

  const allVotes = getVotes();
  if (!allVotes[discountId]) {
    allVotes[discountId] = { active: 0, expired: 0 };
  }
  allVotes[discountId][voteType]++;
  votesCache = allVotes;
  await AsyncStorage.setItem(VOTE_KEY, JSON.stringify(allVotes));

  const uv = getUserVotes();
  uv[discountId] = voteType;
  userVotesCache = uv;
  await AsyncStorage.setItem(USER_VOTES_KEY, JSON.stringify(uv));
}

export function isDiscountExpired(discountId: string, allVotes: Votes): boolean {
  const votes = allVotes[discountId];
  if (!votes || votes.expired < 3) return false;
  return votes.expired >= votes.active * 3;
}

export async function setExpireTimer(discountId: string): Promise<void> {
  try {
    const timers = expireTimersCache ?? {};
    if (!timers[discountId]) {
      timers[discountId] = Date.now() + 60 * 60 * 1000;
      expireTimersCache = timers;
      await AsyncStorage.setItem(EXPIRE_TIMERS_KEY, JSON.stringify(timers));
    }
  } catch {}
}

export function isHiddenFromFeed(discountId: string): boolean {
  const timers = expireTimersCache ?? {};
  const expireAt = timers[discountId];
  if (!expireAt) return false;
  return Date.now() >= expireAt;
}

export function getExpireAt(discountId: string): number | null {
  const timers = expireTimersCache ?? {};
  return timers[discountId] || null;
}
