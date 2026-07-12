import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tsToMs } from '../utils/time';
import type { Discount, Brochure, PendingDiscount, AdRequest, Story } from '../types';

const ITEMS_PER_PAGE = 12;
const VERCEL_PROXY = 'https://indiva-proxy.vercel.app';
const OFFLINE_CACHE_KEY = 'indiva_offline_discounts';
const OFFLINE_CACHE_MAX = 24;

// ─── TTL sabitleri ─────────────────────────────────────────────────────────────
// Anlık indirim uygulaması → kısa TTL, ama her açılışta read yapmaktan tasarruflu
export const HOME_CACHE_TTL   = 30 * 60 * 1000; // 30 dk: ana sayfa ilk sayfa
const        STORIES_TTL      = 10 * 60 * 1000; // 10 dk: hikayeler
const        CAT_SESSION_TTL  = 10 * 60 * 1000; // 10 dk: kategori (oturum içi)
const        CAT_PERSISTENT_TTL = 30 * 60 * 1000; // 30 dk: kategori (AsyncStorage, app restart'ı karşılar)
const        CAT_CACHE_KEY_PREFIX = 'indiva_cat_v1_';

const HOME_CACHE_KEY    = 'indiva_home_v2';
const STORIES_CACHE_KEY = 'indiva_stories_v2'; // affiliateLink normalize edildi

// In-memory session cache: kategori ilk sayfaları (cursor serialize edilemez)
const _catSessionCache = new Map<string, {
  result: { discounts: Discount[]; lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null; hasMore: boolean };
  ts: number;
}>();

// In-memory cache: tekil ilan detayı (FavoritesScreen vb.)
const _discountByIdCache = new Map<string, { discount: Discount; ts: number }>();
const DISCOUNT_BY_ID_TTL = 5 * 60 * 1000; // 5 dk

// ─── Kalıcı kategori cache yardımcıları ───────────────────────────────────────
interface CatPersistentData { discounts: Discount[]; ts: number }

async function getCatPersistentCache(category: string): Promise<CatPersistentData | null> {
  try {
    const raw = await AsyncStorage.getItem(CAT_CACHE_KEY_PREFIX + category);
    if (!raw) return null;
    const data: CatPersistentData = JSON.parse(raw);
    if (Date.now() - data.ts > CAT_PERSISTENT_TTL) return null;
    return data;
  } catch { return null; }
}

function saveCatPersistentCache(category: string, discounts: Discount[]): void {
  AsyncStorage.setItem(
    CAT_CACHE_KEY_PREFIX + category,
    JSON.stringify({ discounts, ts: Date.now() } satisfies CatPersistentData)
  ).catch(() => {});
}

const db = getFirestore();

// ─── Offline Cache ─────────────────────────────────────────────────────────────
export async function saveToOfflineCache(discounts: Discount[]): Promise<void> {
  try {
    const existing = await getOfflineCache();
    const merged = [
      ...discounts,
      ...existing.filter(e => !discounts.find(d => d.id === e.id)),
    ].slice(0, OFFLINE_CACHE_MAX);
    await AsyncStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(merged));
  } catch {}
}

export async function getOfflineCache(): Promise<Discount[]> {
  try {
    const cached = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

// ─── Ana sayfa cache (ilk sayfa) ──────────────────────────────────────────────
export async function getHomeCache(): Promise<{ discounts: Discount[]; ts: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveHomeCache(discounts: Discount[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ discounts, ts: Date.now() }));
  } catch {}
}

// ─── Stories cache ─────────────────────────────────────────────────────────────
// Taze ise cache'den dön (0 read). Bayat ise cache'i hemen dön + arka planda yenile.

// Cache'den okunan story'lere de 24h filtresi uygula — cache sırasında geçerli
// olup sonradan süresi dolan story'lerin ekranda görünmesini önler.
function filterExpiredStories(stories: Story[]): Story[] {
  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;
  return stories.filter(s => {
    if (s.expiresAt) {
      const expMs = tsToMs(s.expiresAt);
      return expMs === null ? true : now < expMs;
    }
    if (s.createdAt) {
      const createdMs = tsToMs(s.createdAt);
      return createdMs === null ? true : now < createdMs + MS_24H;
    }
    // Tarih bilgisi hiç yoksa göster (veri eksikliğine karşı tolerans)
    return true;
  });
}

/**
 * Önce cache'den anında döner, cache bayatsa arka planda yeniler.
 * @param onRefresh  Cache bayat olduğunda arka plan fetch tamamlanınca çağrılır
 *                   — UI bu callback ile güncel veriyi alır (re-render tetiklenir).
 */
export async function fetchStoriesCached(
  onRefresh?: (fresh: Story[]) => void,
): Promise<Story[]> {
  try {
    const raw = await AsyncStorage.getItem(STORIES_CACHE_KEY);
    if (raw) {
      const { stories, ts }: { stories: Story[]; ts: number } = JSON.parse(raw);
      // Cache'den okurken de süresi dolmuş story'leri ayıkla
      const filtered = filterExpiredStories(stories);
      if (Date.now() - ts < STORIES_TTL) return filtered;
      // Bayat → filtrelenmiş veriyi hemen döndür, arka planda yenile
      fetchStories()
        .then(fresh => {
          AsyncStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ stories: fresh, ts: Date.now() })).catch(() => {});
          onRefresh?.(fresh); // ← UI'ı da güncelle
        })
        .catch(() => {});
      return filtered;
    }
  } catch {}
  // Cache yok → fetch et ve kaydet
  const fresh = await fetchStories();
  AsyncStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ stories: fresh, ts: Date.now() })).catch(() => {});
  return fresh;
}

// Pull-to-refresh gibi zorla yenileme durumları için
export async function forceRefreshStories(): Promise<Story[]> {
  const fresh = await fetchStories();
  AsyncStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ stories: fresh, ts: Date.now() })).catch(() => {});
  return fresh;
}

// ─── Kategori ilk sayfa — session cache ───────────────────────────────────────
// Benzer ürünler ve kategori geçişlerinde aynı sorguyu tekrar yapmamak için.
// lastVisible varsa (sayfalama) cache atlanır.
export async function fetchDiscountsByCategoryCached(
  category: string,
  lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null = null,
  forceRefresh = false,
): Promise<{ discounts: Discount[]; lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null; hasMore: boolean }> {
  if (!lastVisible && !forceRefresh) {
    // 1. Bellek cache'i (en hızlı, cursor korumalı)
    const mem = _catSessionCache.get(category);
    if (mem && Date.now() - mem.ts < CAT_SESSION_TTL) return mem.result;

    // 2. AsyncStorage cache (uygulama yeniden açılışını da karşılar)
    const persisted = await getCatPersistentCache(category);
    if (persisted) {
      const result = {
        discounts: persisted.discounts,
        lastVisible: null as FirebaseFirestoreTypes.QueryDocumentSnapshot | null,
        hasMore: false, // cursor serialize edilemez; sayfalama gerekirse Firebase'e gider
      };
      _catSessionCache.set(category, { result, ts: persisted.ts });
      return result;
    }
  }

  const result = await fetchDiscountsByCategory(category, lastVisible);
  if (!lastVisible) {
    _catSessionCache.set(category, { result, ts: Date.now() });
    saveCatPersistentCache(category, result.discounts);
  }
  return result;
}

// ─── Timeout helper ────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} zaman aşımı (${ms / 1000}s)`)), ms)
    ),
  ]);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const isAdExpired = (discount: Discount): boolean => {
  if (!discount.isAd || !discount.expiresAt) return false;
  const now = new Date();
  let expiryDate: Date;
  if (typeof (discount.expiresAt as any).toDate === 'function') {
    expiryDate = (discount.expiresAt as any).toDate();
  } else {
    expiryDate = new Date(discount.expiresAt as any);
  }
  return now.getTime() > expiryDate.getTime();
};

const filterDiscounts = (discounts: Discount[]): Discount[] =>
  discounts.filter(discount => {
    if (isAdExpired(discount)) return false;

    // "İndirim Bitti" + deleteAt → 1 saatlik kaldırma penceresi.
    // Sayaç dolana (deleteAt geçene) kadar ilanı feed'de TUT; DiscountCard onu
    // gri/soluk + geri sayım olarak çizer. Sayaç dolunca feed'den de düşer.
    if (discount.deleteAt) {
      const dt = discount.deleteAt as any;
      const deleteAtMs =
        typeof dt.toMillis === 'function'
          ? dt.toMillis()
          : dt instanceof Date
          ? dt.getTime()
          : new Date(dt).getTime();
      if (deleteAtMs && Date.now() > deleteAtMs) return false; // sayaç doldu → kaldır
      return true; // pencere içinde → göster (kart geri sayımı işler)
    }

    // deleteAt yoksa: süresi bittiği işaretlenmiş eski/sayaçsız ilanı gösterme.
    if (discount.status === 'İndirim Bitti') return false;

    return true;
  });

// ─── Queries ───────────────────────────────────────────────────────────────────
// Sayfalama imleci artık ham bir QueryDocumentSnapshot değil, son ilanın
// createdAt milisaniye değeri — JSON üzerinden taşınabilir bir sayı. Bu,
// ilk sayfanın Vercel edge-cache'inden (bkz. aşağı) veya doğrudan Firestore
// SDK'dan gelmesi farketmeksizin aynı şekilde devam edebilmesini sağlar.
export async function fetchDiscounts(lastVisible: number | null) {
  // İlk sayfa (sayfalama yok) → önce edge-cache dene. Binlerce kullanıcı aynı
  // anda istese de Vercel'in CDN'i bunu Firestore'a TEK okuma olarak yansıtır
  // (bkz. discounts.ts). Ulaşılamazsa sessizce Firestore SDK'ya düşülür.
  if (!lastVisible) {
    try {
      const res = await withTimeout(
        fetch(`${VERCEL_PROXY}/api/discounts`, { headers: { Accept: 'application/json' } }),
        8000,
        'İlanlar (edge)',
      );
      if (res.ok) {
        const json = (await res.json()) as { success?: boolean; discounts?: any[] };
        if (json.success && Array.isArray(json.discounts) && json.discounts.length > 0) {
          const rawDiscounts = json.discounts as Discount[];
          const discounts = filterDiscounts(rawDiscounts);
          const last = rawDiscounts[rawDiscounts.length - 1];
          const newLastVisible = tsToMs(last?.createdAt);
          const hasMore = rawDiscounts.length === ITEMS_PER_PAGE;
          if (discounts.length > 0) saveToOfflineCache(discounts);
          return { discounts, lastVisible: newLastVisible, hasMore };
        }
      }
    } catch {
      // Edge cache ulaşılamadı → aşağıdaki Firestore SDK yoluna düş
    }
  }

  const col = collection(db, 'discounts');
  const q = lastVisible
    ? query(col, orderBy('createdAt', 'desc'), startAfter(Timestamp.fromMillis(lastVisible)), limit(ITEMS_PER_PAGE))
    : query(col, orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE));

  const documentSnapshots = await withTimeout(getDocs(q), 12000, 'İlanlar');
  const rawDiscounts = documentSnapshots.docs.map(
    d => ({ id: d.id, ...d.data() } as Discount)
  );
  const discounts = filterDiscounts(rawDiscounts);
  const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
  const newLastVisible = lastDoc ? tsToMs((lastDoc.data() as any).createdAt) : null;
  const hasMore = documentSnapshots.docs.length === ITEMS_PER_PAGE;

  if (!lastVisible && discounts.length > 0) {
    saveToOfflineCache(discounts);
  }

  return { discounts, lastVisible: newLastVisible, hasMore };
}

export async function fetchDiscountsByCategory(
  category: string,
  lastVisible: any = null
): Promise<{ discounts: Discount[]; lastVisible: any; hasMore: boolean }> {
  try {
    const col = collection(db, 'discounts');
    const q = lastVisible
      ? query(col, where('category', '==', category), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(ITEMS_PER_PAGE))
      : query(col, where('category', '==', category), orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE));
    const snap = await withTimeout(getDocs(q), 12000, 'Kategori ilanları');
    const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as Discount));
    const filtered = filterDiscounts(raw);
    const newLastVisible = snap.docs[snap.docs.length - 1] ?? null;
    return { discounts: filtered, lastVisible: newLastVisible, hasMore: snap.docs.length === ITEMS_PER_PAGE };
  } catch {
    return { discounts: [], lastVisible: null, hasMore: false };
  }
}

export async function fetchSimilarDiscounts(
  category: string,
  currentId: string
): Promise<Discount[]> {
  try {
    // Kategori cache'ini kullan — her ürün açılışında 10 read yerine 0
    // (filterDiscounts zaten fetchDiscountsByCategory sırasında uygulandı)
    const { discounts } = await fetchDiscountsByCategoryCached(category, null);
    return discounts.filter(d => d.id !== currentId).slice(0, 4);
  } catch {
    return [];
  }
}

export async function getDiscountById(id: string): Promise<Discount | null> {
  // Bellek cache'i — FavoritesScreen her focus'ta çağırdığı için önemli
  const cached = _discountByIdCache.get(id);
  if (cached && Date.now() - cached.ts < DISCOUNT_BY_ID_TTL) return cached.discount;

  try {
    const docSnap = await withTimeout(
      getDoc(doc(db, 'discounts', id)),
      10000,
      'İlan detayı'
    );
    if (docSnap.exists()) {
      const discount = { id: docSnap.id, ...docSnap.data() } as Discount;
      if (isAdExpired(discount)) return null;
      _discountByIdCache.set(id, { discount, ts: Date.now() });
      return discount;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tek bir ilanın GÜNCEL topluluk oy sayılarını Firestore'dan çeker.
 * Detay ekranı açıldığında çağrılır. 45 sn'lik kısa bellek cache'i ile hızlı
 * geri-dön (detaya tekrar girme) durumlarında gereksiz read yapılmaz.
 * Kullanıcı oy verince invalidateDiscountVotes(id) ile cache geçersiz kılınır.
 */
type VoteCounts = { activeVotes: number; expiredVotes: number };
const _voteCache = new Map<string, { v: VoteCounts; ts: number }>();
const VOTE_CACHE_TTL = 45 * 1000; // 45 sn

export function invalidateDiscountVotes(id: string): void {
  _voteCache.delete(id);
}

export async function fetchDiscountVotes(id: string): Promise<VoteCounts | null> {
  const cached = _voteCache.get(id);
  if (cached && Date.now() - cached.ts < VOTE_CACHE_TTL) return cached.v;

  try {
    const snap = await withTimeout(getDoc(doc(db, 'discounts', id)), 8000, 'Oy sayısı');
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const v: VoteCounts = {
      activeVotes: typeof data?.activeVotes === 'number' ? data.activeVotes : 0,
      expiredVotes: typeof data?.expiredVotes === 'number' ? data.expiredVotes : 0,
    };
    _voteCache.set(id, { v, ts: Date.now() });
    return v;
  } catch {
    return null;
  }
}

// Broşürler günlük/haftalık değişir → 3 saat cache UX'i bozmaz, her sekmede 20 read'i önler.
const BROCHURE_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 saat
const BROCHURE_CACHE_PREFIX = 'indiva_brochures_v1_';

export async function fetchBrochuresByStore(storeName: string): Promise<Brochure[]> {
  const cacheKey = BROCHURE_CACHE_PREFIX + storeName;

  // 1. Taze cache → 0 read
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as { brochures: Brochure[]; ts: number };
      if (Date.now() - cached.ts < BROCHURE_CACHE_TTL) return cached.brochures;
    }
  } catch {}

  // 2. Firestore'dan çek + cache'le
  try {
    const col = collection(db, `circulars/${storeName}/brochures`);
    const q = query(col, orderBy('createdAt', 'desc'), limit(20));
    const documentSnapshots = await withTimeout(getDocs(q), 10000, 'Broşürler');
    const brochures = documentSnapshots.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Brochure[];
    AsyncStorage.setItem(cacheKey, JSON.stringify({ brochures, ts: Date.now() })).catch(() => {});
    return brochures;
  } catch {
    // 3. Ağ hatası → bayat cache varsa onu döndür (boş ekran yerine)
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) return (JSON.parse(raw) as { brochures: Brochure[] }).brochures;
    } catch {}
    return [];
  }
}

/**
 * Story'leri Firestore'dan çeker. NOT: Daha önce burada Vercel Edge Cache
 * üzerinden gitmeyi deneyen bir kod vardı (indiva-proxy.vercel.app/api/stories)
 * ama bu endpoint hiç deploy edilmemiş — canlıda her zaman 404 dönüyordu,
 * yani "cache" hiç devrede değildi, her çağrı zaten doğrudan buraya (SDK
 * fallback'e) düşüyordu. Kaldırıldı; client tarafı zaten fetchStoriesCached
 * ile 10 dk'lık cache uyguluyor, bu yeterli. limit(30) eklendi — öncesinde
 * sınırsızdı (tüm aktif story'leri çekiyordu).
 */
export async function fetchStories(): Promise<Story[]> {
  try {
    const col = collection(db, 'influencerStories');
    const q = query(col, where('isActive', '==', true), orderBy('createdAt', 'desc'), limit(30));
    const snap = await withTimeout(getDocs(q), 10000, 'Hikayeler');
    const now = Date.now();
    const MS_24H = 24 * 60 * 60 * 1000;
    return snap.docs
      .map(d => {
        const data = d.data();
        const resolvedLink: string | undefined =
          data.affiliateLink || data.link || data.productLink || data.url || data.productUrl || undefined;
        return { id: d.id, ...data, link: resolvedLink } as Story;
      })
      .filter(s => {
        if (s.expiresAt) {
          const expMs = tsToMs(s.expiresAt);
          return expMs === null ? true : now < expMs;
        }
        if (s.createdAt) {
          const createdMs = tsToMs(s.createdAt);
          return createdMs === null ? true : now < createdMs + MS_24H;
        }
        return true;
      });
  } catch {
    return [];
  }
}

export async function submitPendingDiscount(
  data: Omit<PendingDiscount, 'createdAt' | 'status'>
) {
  await addDoc(collection(db, 'pendingDiscounts'), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'pending',
  });
  return true;
}

export async function submitAdRequest(
  data: Omit<AdRequest, 'id' | 'createdAt' | 'status'>
) {
  await addDoc(collection(db, 'adRequests'), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'pending',
  });
  return true;
}
