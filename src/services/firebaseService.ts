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
import type { Discount, Brochure, PendingDiscount, AdRequest } from '../types';

const ITEMS_PER_PAGE = 12;
const OFFLINE_CACHE_KEY = 'indiva_offline_discounts';
const OFFLINE_CACHE_MAX = 24;

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

export async function fetchDiscountsByCategory(category: string): Promise<Discount[]> {
  try {
    const col = collection(db, 'discounts');
    const q = query(col, where('category', '==', category), limit(100));
    const snap = await withTimeout(getDocs(q), 12000, 'Kategori ilanları');
    const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as Discount));
    const filtered = filterDiscounts(raw);
    filtered.sort((a, b) => {
      const ms = (d: Discount) => {
        const ct = (d as any).createdAt;
        if (!ct) return 0;
        if (typeof ct.toMillis === 'function') return ct.toMillis();
        if (ct.seconds) return ct.seconds * 1000;
        return 0;
      };
      return ms(b) - ms(a);
    });
    return filtered;
  } catch {
    return [];
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
  if (docSnap.exists) {
    const discount = { id: docSnap.id, ...docSnap.data() } as Discount;
    if (isAdExpired(discount)) return null;
    return discount;
  }
  return null;
}

export async function fetchBrochuresByStore(storeName: string): Promise<Brochure[]> {
  const col = collection(db, `circulars/${storeName}/brochures`);
  const q = query(col, orderBy('createdAt', 'desc'));
  const documentSnapshots = await withTimeout(getDocs(q), 10000, 'Broşürler');
  return documentSnapshots.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as Brochure[];
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
