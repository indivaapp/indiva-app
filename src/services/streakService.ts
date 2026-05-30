import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBonusPoints } from './rewardService';

// ─── Günlük seri (streak) ────────────────────────────────────────────────────
// Kullanıcı uygulamayı her gün açtıkça seri büyür; bir gün atlanırsa sıfırlanır.
// Günde bir kez küçük bir puan ödülü verilir (rütbe yolunda ilerletir).

const STREAK_COUNT_KEY = 'streakCount';
const STREAK_DATE_KEY  = 'streakLastDate';

export const STREAK_DAILY_POINTS = 3; // günlük açılış ödülü (ayarlanabilir)

function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface StreakState {
  streak: number;       // ardışık gün sayısı
  awardedToday: boolean; // bu açılışta günlük ödül verildi mi
}

let cache: StreakState | null = null;

/**
 * Uygulama açılışında bir kez çağrılır.
 * Seriyi günceller; bugün ilk açılışsa günlük puanı ekler.
 */
export async function updateStreakOnOpen(): Promise<StreakState> {
  try {
    const [lastDate, countStr] = await Promise.all([
      AsyncStorage.getItem(STREAK_DATE_KEY),
      AsyncStorage.getItem(STREAK_COUNT_KEY),
    ]);
    let count = countStr ? parseInt(countStr, 10) : 0;
    const today = dayKey();

    if (lastDate === today) {
      // Bugün zaten açılmış — değişiklik yok
      cache = { streak: count, awardedToday: false };
      return cache;
    }

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = dayKey(yesterdayDate);

    count = lastDate === yesterday ? count + 1 : 1; // dün açıldıysa +1, yoksa sıfırla

    await AsyncStorage.setItem(STREAK_COUNT_KEY, String(count));
    await AsyncStorage.setItem(STREAK_DATE_KEY, today);
    await addBonusPoints(STREAK_DAILY_POINTS);

    cache = { streak: count, awardedToday: true };
    return cache;
  } catch {
    cache = { streak: 0, awardedToday: false };
    return cache;
  }
}

/** Mevcut seri sayısını döner (cache varsa ondan). */
export async function getStreak(): Promise<number> {
  if (cache) return cache.streak;
  try {
    const c = await AsyncStorage.getItem(STREAK_COUNT_KEY);
    return c ? parseInt(c, 10) : 0;
  } catch { return 0; }
}
