import { NativeAd } from 'react-native-google-mobile-ads';

// ─── Native reklam havuzu (slot bazlı cache) ─────────────────────────────────
// Sorun: FlashList hücreleri geri dönüştürdüğü için, feed'i kaydırınca her reklam
// hücresi yeniden mount olup yeni bir createForAdRequest atıyordu → boşa giden
// istekler, düşük görüntülenme oranı.
// Çözüm: reklamı SLOT ANAHTARINA göre cache'le. Aynı slot (örn. "home-ad-2")
// tekrar görününce aynı reklamı yeniden kullan; TTL dolunca tazele.
// Aynı anda görünen her slot farklı anahtara sahip olduğundan, her görünür reklam
// kendi NativeAd örneğini alır (aynı reklamı iki view'da göstermek sorun çıkarmaz).

interface Entry {
  ad: NativeAd | null;
  ts: number;
  promise: Promise<NativeAd> | null;
}

const cache = new Map<string, Entry>();
const TTL = 5 * 60 * 1000; // 5 dk: bayat reklamı tazele
const MAX_ENTRIES = 12;    // bellek sınırı — en eski girdiler atılır

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTs = Infinity;
  for (const [k, e] of cache) {
    if (e.ts < oldestTs) { oldestTs = e.ts; oldestKey = k; }
  }
  if (oldestKey) {
    cache.get(oldestKey)?.ad?.destroy();
    cache.delete(oldestKey);
  }
}

/**
 * Slot anahtarına göre native reklam döndürür.
 * Taze cache varsa onu kullanır; yoksa (veya TTL dolduysa) yeni reklam yükler.
 * Reklamın ömrü havuza aittir — kart unmount olunca destroy edilmez.
 */
export function getCachedNativeAd(
  key: string,
  unitId: string,
  nonPersonalized: boolean,
): Promise<NativeAd> {
  const existing = cache.get(key);
  if (existing) {
    if (existing.ad && Date.now() - existing.ts < TTL) return Promise.resolve(existing.ad);
    if (existing.promise) return existing.promise;
  }

  const promise = NativeAd.createForAdRequest(unitId, {
    requestNonPersonalizedAdsOnly: nonPersonalized,
  })
    .then(ad => {
      const prev = cache.get(key);
      if (prev?.ad && prev.ad !== ad) prev.ad.destroy(); // eski/bayat reklamı temizle
      cache.set(key, { ad, ts: Date.now(), promise: null });
      evictIfNeeded();
      return ad;
    })
    .catch(err => {
      // Başarısız isteği cache'te bırakma — bir sonraki denemede yeniden istesin
      const cur = cache.get(key);
      if (cur && cur.promise === promise) cache.delete(key);
      throw err;
    });

  cache.set(key, { ad: existing?.ad ?? null, ts: existing?.ts ?? 0, promise });
  return promise;
}
