import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserVotes } from './voteService';

export interface Badge {
  icon: string;
  label: string;
  min: number;
  gradient: [string, string];
  ring: string;
}

export const BADGE_TIERS: Badge[] = [
  {
    min: 5000,
    icon: '👑',
    label: 'İndirim Ustası',
    gradient: ['#facc15', '#f97316'],
    ring: '#facc15',
  },
  {
    min: 2400,
    icon: '🔥',
    label: 'Fırsat Uzmanı',
    gradient: ['#f97316', '#ef4444'],
    ring: '#f97316',
  },
  {
    min: 1000,
    icon: '🏷️',
    label: 'İndirim Takipçisi',
    gradient: ['#f97316', '#fb923c'],
    ring: '#fb923c',
  },
  {
    min: 300,
    icon: '🔍',
    label: 'Aktif Üye',
    gradient: ['#3b82f6', '#6366f1'],
    ring: '#3b82f6',
  },
  {
    min: 0,
    icon: '🌱',
    label: 'Yeni Fırsat Avcısı',
    gradient: ['#4ade80', '#14b8a6'],
    ring: '#4ade80',
  },
];

const SORTED_TIERS = [...BADGE_TIERS].sort((a, b) => a.min - b.min);

const CLAIMED_TIER_KEY = 'claimedBadgeTierMin';

export async function getClaimedTierMin(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(CLAIMED_TIER_KEY);
    return val !== null ? parseInt(val, 10) : 0;
  } catch { return 0; }
}

export async function setClaimedTierMin(min: number): Promise<void> {
  try { await AsyncStorage.setItem(CLAIMED_TIER_KEY, String(min)); } catch {}
}

export interface ContributionStats {
  points: number;
  voteCount: number;
  favoriteCount: number;
  visitCount: number;
  badge: Badge;
  nextTier: Badge | null;
  pendingRankUp: Badge | null;
  progress: number;
}

export async function getContributionStats(): Promise<ContributionStats> {
  const voteCount = Object.keys(getUserVotes()).length;

  let favoriteCount = 0;
  try {
    const favStr = await AsyncStorage.getItem('favoriteDiscounts');
    favoriteCount = favStr ? (JSON.parse(favStr) as string[]).length : 0;
  } catch {}

  let rawVisits = 0;
  try {
    const visitsStr = await AsyncStorage.getItem('detailVisitCount');
    rawVisits = visitsStr ? parseInt(visitsStr, 10) : 0;
  } catch {}

  const visitCount = Math.min(rawVisits, 50);
  const points = voteCount * 10 + favoriteCount * 5 + visitCount * 2;

  const claimedMin = await getClaimedTierMin();

  // Displayed badge = claimed tier (what the user has unlocked via ad)
  const displayedBadge =
    SORTED_TIERS.slice().reverse().find(t => t.min <= claimedMin) ??
    SORTED_TIERS[0];

  // Next tier from displayed badge perspective
  const displayedIndex = SORTED_TIERS.findIndex(t => t.min === displayedBadge.min);
  const nextTier =
    displayedIndex < SORTED_TIERS.length - 1 ? SORTED_TIERS[displayedIndex + 1] : null;

  // pendingRankUp: user qualifies for next tier but hasn't claimed it yet
  const pendingRankUp = nextTier && points >= nextTier.min ? nextTier : null;

  const progress = nextTier
    ? Math.min(
        Math.round(((points - displayedBadge.min) / (nextTier.min - displayedBadge.min)) * 100),
        pendingRankUp ? 100 : 99
      )
    : 100;

  return { points, voteCount, favoriteCount, visitCount: rawVisits, badge: displayedBadge, nextTier, pendingRankUp, progress };
}
