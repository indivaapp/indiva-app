import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Ödüllü reklam → puan ────────────────────────────────────────────────────
// Kullanıcı ödüllü reklam izleyince rütbe yolunda puan kazanır.
// (Reklamsız kullanım özelliği kaldırıldı — sadece puan ödülü.)

const BONUS_POINTS_KEY = 'rewardBonusPoints'; // ödüllü reklamdan kazanılan toplam puan
const DAILY_CLAIMS_KEY = 'rewardPointsDaily'; // JSON { date, count } — günlük limit

export const REWARD_POINTS      = 200; // her ödüllü reklamda kazanılan puan
export const DAILY_POINTS_LIMIT = 3;   // günde en fazla kaç kez puan kazanılır

// ─── Günlük limit ────────────────────────────────────────────────────────────
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function getTodayPointsClaims(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_CLAIMS_KEY);
    if (!raw) return 0;
    const obj = JSON.parse(raw) as { date: string; count: number };
    return obj.date === todayKey() ? obj.count : 0;
  } catch { return 0; }
}

async function incrementTodayPointsClaims(): Promise<void> {
  const current = await getTodayPointsClaims(); // gün değiştiyse 0 döner
  try {
    await AsyncStorage.setItem(DAILY_CLAIMS_KEY, JSON.stringify({ date: todayKey(), count: current + 1 }));
  } catch {}
}

// ─── Bonus puan ──────────────────────────────────────────────────────────────
export async function getBonusPoints(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(BONUS_POINTS_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

export async function addBonusPoints(n: number): Promise<void> {
  const cur = await getBonusPoints();
  try { await AsyncStorage.setItem(BONUS_POINTS_KEY, String(cur + n)); } catch {}
}

// ─── Ödül verme ───────────────────────────────────────────────────────────────
// Ödüllü reklam başarıyla tamamlanınca çağrılır.
// Günlük limit dahilinde +REWARD_POINTS puan ekler.
// Dönüş: pointsAwarded (0 ise günlük limit dolmuş demektir).
export async function grantRewardedReward(): Promise<{ pointsAwarded: number }> {
  const claims = await getTodayPointsClaims();
  if (claims >= DAILY_POINTS_LIMIT) return { pointsAwarded: 0 };

  await addBonusPoints(REWARD_POINTS);
  await incrementTodayPointsClaims();
  return { pointsAwarded: REWARD_POINTS };
}
