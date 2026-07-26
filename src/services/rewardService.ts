import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Bonus puan defteri ──────────────────────────────────────────────────────
// Rütbe yolu puanına eklenen, günlük giriş serisi gibi kaynaklardan gelen
// bonus puanları tutar (bkz. streakService, contributionService).

const BONUS_POINTS_KEY = 'rewardBonusPoints';

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
