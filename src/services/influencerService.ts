import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InfluencerPost } from '../types';

const db = getFirestore();
const SEEN_KEY = 'seenInfluencerPosts';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

export async function fetchInfluencerPosts(): Promise<InfluencerPost[]> {
  try {
    const col = collection(db, 'influencerPosts');
    const q = query(col, orderBy('createdAt', 'desc'), limit(20));
    const snap = await withTimeout(getDocs(q), 10000);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as InfluencerPost[];
  } catch {
    return [];
  }
}

export async function getSeenPostIds(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(SEEN_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

export async function markPostAsSeen(id: string): Promise<void> {
  try {
    const current = await getSeenPostIds();
    if (!current.includes(id)) {
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...current, id]));
    }
  } catch {}
}
