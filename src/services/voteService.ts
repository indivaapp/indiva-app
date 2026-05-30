import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  doc,
  updateDoc,
  increment,
} from '@react-native-firebase/firestore';
import type { Discount } from '../types';

const USER_VOTES_KEY = 'userVotes';
const EXPIRE_TIMERS_KEY = 'discountExpireTimers';

const db = getFirestore();

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Oy SAYILARI artık Firestore'da (ilan dokümanında activeVotes/expiredVotes).
// Cihazda yalnızca "bu kullanıcı hangi ilana ne oy verdi" + süre sayaçları tutulur.
let userVotesCache: Record<string, 'active' | 'expired'> | null = null;
let expireTimersCache: Record<string, number> | null = null;

export async function loadVotesCache(): Promise<void> {
  try {
    const [userVotesStr, timersStr] = await Promise.all([
      AsyncStorage.getItem(USER_VOTES_KEY),
      AsyncStorage.getItem(EXPIRE_TIMERS_KEY),
    ]);
    userVotesCache = userVotesStr ? JSON.parse(userVotesStr) : {};
    expireTimersCache = timersStr ? JSON.parse(timersStr) : {};
  } catch {
    userVotesCache = {};
    expireTimersCache = {};
  }
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

// ─── Oy verme — Firestore'da topluluk sayacını artırır ─────────────────────────
// Başarılı olursa cihazda "oy verildi" işaretlenir (tekrar oyu engeller).
// Dönüş: yazma başarılı mı (false ise UI iyimser değişikliği geri alabilir).
export async function addVote(
  discountId: string,
  voteType: 'active' | 'expired',
): Promise<boolean> {
  if (hasUserVoted(discountId)) return false;

  const field = voteType === 'active' ? 'activeVotes' : 'expiredVotes';
  try {
    await updateDoc(doc(db, 'discounts', discountId), { [field]: increment(1) });
  } catch {
    return false; // ağ/kural hatası → oy kaydedilmedi, kullanıcı tekrar deneyebilir
  }

  const uv = getUserVotes();
  uv[discountId] = voteType;
  userVotesCache = uv;
  try { await AsyncStorage.setItem(USER_VOTES_KEY, JSON.stringify(uv)); } catch {}
  return true;
}

// ─── Topluluk kararı: ilan "süresi doldu" sayılır mı? ──────────────────────────
// Sayılar ilan dokümanından (server) gelir. En az 3 "bitti" oyu VE bitti ≥ aktif×3.
export function isDiscountExpired(discount: Pick<Discount, 'activeVotes' | 'expiredVotes'>): boolean {
  const active = discount.activeVotes ?? 0;
  const expired = discount.expiredVotes ?? 0;
  if (expired < 3) return false;
  return expired >= active * 3;
}

// ─── Süre sayaçları (oy ile "bitti" sayılınca 1 saatlik geri sayım) ────────────
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
