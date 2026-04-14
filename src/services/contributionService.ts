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

export interface ContributionStats {
  points: number;
  voteCount: number;
  favoriteCount: number;
  visitCount: number;
  badge: Badge;
  nextTier: Badge | null;
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

  const badge =
    BADGE_TIERS.find(t => points >= t.min) ?? BADGE_TIERS[BADGE_TIERS.length - 1];
  const nextTier =
    [...BADGE_TIERS].reverse().find(t => t.min > points) ?? null;

  const progress = nextTier
    ? Math.min(
        Math.round(((points - badge.min) / (nextTier.min - badge.min)) * 100),
        99
      )
    : 100;

  return { points, voteCount, favoriteCount, visitCount: rawVisits, badge, nextTier, progress };
}
