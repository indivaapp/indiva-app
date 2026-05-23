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
} from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Discount, Brochure, PendingDiscount, AdRequest, Story } from '../types';

const ITEMS_PER_PAGE = 12;
const OFFLINE_CACHE_KEY = 'indiva_offline_discounts';
const OFFLINE_CACHE_MAX = 24;

// ─── TTL sabitleri ─────────────────────────────────────────────────────────────
// Anlık indirim uygulaması → kısa TTL, ama her açılışta read yapmaktan tasarruflu
export const HOME_CACHE_TTL   = 3  * 60 * 1000; //  3 dk: ana sayfa ilk sayfa
const        STORIES_TTL      = 10 * 60 * 1000; // 10 dk: hikayeler
const        CAT_SESSION_TTL  = 10 * 60 * 1000; // 10 dk: benzer ürün (oturum içi)

const HOME_CACHE_KEY    = 'indiva_home_v2';
const STORIES_CACHE_KEY = 'indiva_stories_v2'; // affiliateLink normalize edildi

// In-memory session cache: kategori ilk sayfaları (cursor serialize edilemez)
const _catSessionCache = new Map<string, {
  result: { discounts: Discount[]; lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null; hasMore: boolean };
  ts: number;
}>();

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
// Firebase Timestamp → ms dönüşümü.
// 3 formatı destekler:
//   1. Gerçek Timestamp nesnesi (.toMillis)
//   2. JSON'dan deserialize edilmiş plain object ({seconds, nanoseconds})
//   3. ISO string veya number (fallback)
function tsToMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? null : ms;
}

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

export async function fetchStoriesCached(): Promise<Story[]> {
  try {
    const raw = await AsyncStorage.getItem(STORIES_CACHE_KEY);
    if (raw) {
      const { stories, ts }: { stories: Story[]; ts: number } = JSON.parse(raw);
      // Cache'den okurken de süresi dolmuş story'leri ayıkla
      const filtered = filterExpiredStories(stories);
      if (Date.now() - ts < STORIES_TTL) return filtered;
      // Bayat → filtrelenmiş veriyi hemen döndür, arka planda yenile
      fetchStories()
        .then(fresh =>
          AsyncStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ stories: fresh, ts: Date.now() }))
        )
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
  lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null = null
): Promise<{ discounts: Discount[]; lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null; hasMore: boolean }> {
  if (!lastVisible) {
    const cached = _catSessionCache.get(category);
    if (cached && Date.now() - cached.ts < CAT_SESSION_TTL) return cached.result;
  }
  const result = await fetchDiscountsByCategory(category, lastVisible);
  if (!lastVisible) {
    _catSessionCache.set(category, { result, ts: Date.now() });
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
    if (discount.status === 'İndirim Bitti') return false;
    if (discount.deleteAt) {
      const dt = discount.deleteAt as any;
      const deleteAtMs =
        typeof dt.toMillis === 'function'
          ? dt.toMillis()
          : dt instanceof Date
          ? dt.getTime()
          : new Date(dt).getTime();
      if (deleteAtMs && Date.now() > deleteAtMs) return false;
    }
    return true;
  });

// ─── Queries ───────────────────────────────────────────────────────────────────
export async function fetchDiscounts(
  lastVisible: FirebaseFirestoreTypes.QueryDocumentSnapshot | null
) {
  const col = collection(db, 'discounts');
  const q = lastVisible
    ? query(col, orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(ITEMS_PER_PAGE))
    : query(col, orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE));

  const documentSnapshots = await withTimeout(getDocs(q), 12000, 'İlanlar');
  const rawDiscounts = documentSnapshots.docs.map(
    d => ({ id: d.id, ...d.data() } as Discount)
  );
  const discounts = filterDiscounts(rawDiscounts);
  const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1] ?? null;
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
    const col = collection(db, 'discounts');
    const q = query(col, where('category', '==', category), limit(10));
    const documentSnapshots = await withTimeout(getDocs(q), 10000, 'Benzer ilanlar');
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return documentSnapshots.docs
      .map(d => ({ id: d.id, ...d.data() } as Discount))
      .filter(d => {
        if (d.id === currentId) return false;
        if (isAdExpired(d)) return false;
        if (d.status === 'İndirim Bitti') return false;
        if (d.deleteAt) {
          const dt = d.deleteAt as any;
          const ms =
            typeof dt.toMillis === 'function'
              ? dt.toMillis()
              : dt instanceof Date
              ? dt.getTime()
              : new Date(dt).getTime();
          if (ms && Date.now() > ms) return false;
        }
        const ct = d.createdAt as any;
        if (ct) {
          const ms =
            typeof ct.toMillis === 'function'
              ? ct.toMillis()
              : ct.seconds
              ? ct.seconds * 1000
              : 0;
          if (ms && ms < cutoff) return false;
        }
        return true;
      })
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function getDiscountById(id: string): Promise<Discount | null> {
  const docSnap = await withTimeout(
    getDoc(doc(db, 'discounts', id)),
    10000,
    'İlan detayı'
  );
  if (docSnap.exists()) {
    const discount = { id: docSnap.id, ...docSnap.data() } as Discount;
    if (isAdExpired(discount)) return null;
    return discount;
  }
  return null;
}

export async function fetchBrochuresByStore(storeName: string): Promise<Brochure[]> {
  const col = collection(db, `circulars/${storeName}/brochures`);
  const q = query(col, orderBy('createdAt', 'desc'), limit(20));
  const documentSnapshots = await withTimeout(getDocs(q), 10000, 'Broşürler');
  return documentSnapshots.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as Brochure[];
}

export async function fetchStories(): Promise<Story[]> {
  try {
    const col = collection(db, 'influencerStories');
    const q = query(col, where('isActive', '==', true), orderBy('createdAt', 'desc'));
    const snap = await withTimeout(getDocs(q), 10000, 'Hikayeler');
    const now = Date.now();
    const MS_24H = 24 * 60 * 60 * 1000; // fetchStories filter ile paylaşılıyor
    return snap.docs
      .map(d => {
        const data = d.data();
        // Firebase belgelerinde alan adı link, productLink veya url olabilir — normalize et
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
