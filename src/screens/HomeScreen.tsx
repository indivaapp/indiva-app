import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  BackHandler,
  Modal,
  Animated,
  AppState,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchDiscounts,
  fetchDiscountsByCategory,
  fetchDiscountsByCategoryCached,
  getOfflineCache,
  fetchStoriesCached,
  getHomeCache,
  saveHomeCache,
} from '../services/firebaseService';
import NativeAdCard from '../components/NativeAdCard';
import { EXTRA_AD_PLACEMENTS } from '../constants/adUnits';
import { isDiscountExpired, isHiddenFromFeed, loadVotesCache } from '../services/voteService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Discount, Story } from '../types';
import DiscountCard from '../components/DiscountCard';
import StoriesBar from '../components/InfluencerStoriesBar';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { CATEGORIES, normalizeCategory } from '../constants/categories';
// FirebaseFirestoreTypes import kaldırıldı — type çakışması nedeniyle any kullanılıyor
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface HomeScreenProps {
  notificationCount: number;
}

const getFavoriteIds = async (): Promise<string[]> => {
  try {
    const v = await AsyncStorage.getItem('favoriteDiscounts');
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};

const toggleFavoriteId = async (discountId: string): Promise<string[]> => {
  const current = await getFavoriteIds();
  const next = current.includes(discountId)
    ? current.filter(id => id !== discountId)
    : [...current, discountId];
  await AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(next));
  return next;
};

export default function HomeScreen({ notificationCount }: HomeScreenProps) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Arama gecikmesi: kullanıcı yazmayı bırakınca 300ms sonra filtreleme çalışır
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  // ── Kategori-spesifik sayfalama ───────────────────────────────────────────────
  // "Tümü" dışı kategori seçildiğinde bu state kullanılır.
  // Global feed'i filtreleyen auto-fill döngüsünü ortadan kaldırır.
  const [catDiscounts, setCatDiscounts]     = useState<Discount[]>([]);
  const [catLastVisible, setCatLastVisible] = useState<any>(null);
  const [catHasMore, setCatHasMore]         = useState(false);
  // Hangi kategori için sonuç gösterildiğini izler.
  // selectedCategory !== catResultsFor ise fetch henüz tamamlanmamış demektir.
  const [catResultsFor, setCatResultsFor]   = useState<string>('');
  const catLastVisibleRef = useRef<any>(null);
  const catHasMoreRef     = useRef(false);
  const catLoadingRef     = useRef(false);
  const catFetchIdRef     = useRef(0);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [viewedStoryIds, setViewedStoryIds] = useState<string[]>([]);
  const bellPulse = useRef(new Animated.Value(1)).current;
  // Arama sonuçları değişirken listeyi solar → güncelle → aç
  const listFade = useRef(new Animated.Value(1)).current;
  const bellPulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const shimmerLoop = useRef<Animated.CompositeAnimation | null>(null);
  const isLoadingRef = useRef(false);
  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

  // Kategorileri ürün adedine göre sırala (çoktan aza). "Tümü" daima en başta.
  const allCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of discounts) {
      const c = normalizeCategory(d.category);
      counts[c] = (counts[c] || 0) + 1;
    }
    const sorted = [...CATEGORIES].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return ['Tümü', ...sorted];
  }, [discounts]);

  // Shimmer animation for skeleton loader
  useEffect(() => {
    shimmerLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    shimmerLoop.current.start();
    return () => shimmerLoop.current?.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pulse animation on bell icon when there are unread notifications
  useEffect(() => {
    if (notificationCount > 0) {
      bellPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bellPulse, { toValue: 1.18, duration: 380, useNativeDriver: true }),
          Animated.timing(bellPulse, { toValue: 1, duration: 380, useNativeDriver: true }),
        ]),
      );
      bellPulseLoop.current.start();
    } else {
      bellPulseLoop.current?.stop();
      bellPulse.setValue(1);
    }
    return () => bellPulseLoop.current?.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationCount]);

  // Sort stories: unseen first, then seen
  const sortedStories = useMemo(() => {
    if (!stories.length) return stories;
    return [...stories].sort((a, b) => {
      const aViewed = viewedStoryIds.includes(a.id);
      const bViewed = viewedStoryIds.includes(b.id);
      if (aViewed === bViewed) return 0;
      return aViewed ? 1 : -1;
    });
  }, [stories, viewedStoryIds]);

  useEffect(() => {
    loadVotesCache(); // isHiddenFromFeed için süre sayaçlarını yükler
    loadInitial();
    // İlk yükleme: cache varsa anında göster, bayatsa arka planda yenile ve UI'ı güncelle
    fetchStoriesCached(fresh => setStories(fresh)).then(s => {
      setStories(s);
      setStoriesLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uygulama arka plandan öne geldiğinde story'leri yenile —
  // ancak en az STORIES_TTL kadar (10 dk) aralıkla, her geçişte Firebase okuma yapmamak için.
  useEffect(() => {
    let lastStoryRefresh = 0; // timestamp; 0 = hiç yenilenmedi
    const STORY_FOREGROUND_MIN_INTERVAL = 10 * 60 * 1000; // 10 dk
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        const now = Date.now();
        if (now - lastStoryRefresh < STORY_FOREGROUND_MIN_INTERVAL) return;
        lastStoryRefresh = now;
        fetchStoriesCached(fresh => setStories(fresh))
          .then(s => setStories(s))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Tab butonuna basılınca kategoriyi sıfırla
  useEffect(() => {
    return navigation.addListener('tabPress' as any, () => {
      if (selectedCategory !== 'Tümü') {
        setSelectedCategory('Tümü');
        setSearchTerm('');
      }
    });
  }, [navigation, selectedCategory]);

  useFocusEffect(useCallback(() => {
    const onBack = () => { setShowExitModal(true); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []));

  // Sekme odağa geldiğinde favorileri, story listesini ve görülmüş ID'leri yenile
  useFocusEffect(useCallback(() => {
    getFavoriteIds().then(setFavorites);
    AsyncStorage.getItem('indiva_viewed_influencer_stories')
      .then(v => setViewedStoryIds(v ? JSON.parse(v) : []))
      .catch(() => {});
    // Story listesini yenile: cache bayatsa arka plan refresh UI'ı da günceller
    fetchStoriesCached(fresh => setStories(fresh)).then(setStories).catch(() => {});
  }, []));

  const lastVisibleRef = useRef(lastVisible);
  useEffect(() => { lastVisibleRef.current = lastVisible; }, [lastVisible]);

  const hasMoreRef = useRef(hasMore);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const loadInitial = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setError(null);

    let hasLocalData = false;
    try {
      // 1. TTL cache kontrolü — taze ise Firebase'e hiç gitme
      const homeCache = await getHomeCache();
      if (homeCache && homeCache.discounts.length > 0) {
        setDiscounts(homeCache.discounts);
        setLastVisible(null); // cache'den sayfalama yapılamaz
        setHasMore(false);
        hasLocalData = true;

        const isFresh = Date.now() - homeCache.ts < 3 * 60 * 1000;
        if (isFresh) {
          // Taze cache: Firebase'e gitme, 0 read
          isLoadingRef.current = false;
          return;
        }
        // Bayat cache: içeriği göster, arka planda sessizce yenile (spinner yok)
      } else {
        setIsLoading(true); // İlk yükleme, cache yok
      }

      // 2. Firebase'den taze veri çek
      const result = await fetchDiscounts(null);
      setDiscounts(result.discounts);
      setLastVisible(result.lastVisible);
      setHasMore(result.hasMore);
      saveHomeCache(result.discounts);
      setIsOffline(false);
    } catch {
      if (!hasLocalData) {
        const offline = await getOfflineCache();
        if (offline.length > 0) {
          setDiscounts(offline);
          setIsOffline(true);
        } else {
          setError('İndirimler yüklenemedi. İnternet bağlantınızı kontrol edin.');
        }
      }
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const result = await fetchDiscounts(lastVisibleRef.current);
      if (result.discounts.length > 0) {
        setDiscounts(prev => {
          const ids = new Set(prev.map(d => d.id));
          return [...prev, ...result.discounts.filter(d => !ids.has(d.id))];
        });
        setLastVisible(result.lastVisible);
      }
      setHasMore(result.hasMore);
    } catch {
      setError('Daha fazla yüklenemedi.');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await loadVotesCache();

      if (selectedCategory === 'Tümü') {
        const result = await fetchDiscounts(null);
        setDiscounts(result.discounts);
        setLastVisible(result.lastVisible);
        setHasMore(result.hasMore);
        saveHomeCache(result.discounts);
      } else {
        // forceRefresh=true → cache'i atla, yeni veriyi cache'e yaz
        const catResult = await fetchDiscountsByCategoryCached(selectedCategory, null, true);
        setCatDiscounts(catResult.discounts);
        setCatLastVisible(catResult.lastVisible);
        catLastVisibleRef.current = catResult.lastVisible;
        setCatHasMore(catResult.hasMore);
        catHasMoreRef.current = catResult.hasMore;
      }
      setIsOffline(false);
    } catch {
      setError('Yenilenirken hata oluştu.');
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedCategory]);

  // ── Kategori seçilince Firebase'den kategori-spesifik veri çek ──────────────
  useEffect(() => {
    if (selectedCategory === 'Tümü') {
      // Tümü'ne dönünce cat state'i temizle (hafıza tasarrufu)
      setCatDiscounts([]);
      setCatResultsFor('');
      setCatLastVisible(null);
      catLastVisibleRef.current = null;
      catHasMoreRef.current = false;
      catLoadingRef.current = false;
      return;
    }

    const fetchId = ++catFetchIdRef.current;
    const capturedCategory = selectedCategory;
    setCatDiscounts([]);
    setCatLastVisible(null);
    catLastVisibleRef.current = null;
    catHasMoreRef.current = false;
    catLoadingRef.current = false;
    setError(null);
    setIsLoading(true);
    catLoadingRef.current = true;

    // İlk sayfa için session cache kullan → aynı kategoriye dönünce 0 read
    fetchDiscountsByCategoryCached(capturedCategory, null)
      .then(({ discounts: items, lastVisible: lv, hasMore: hm }) => {
        if (fetchId !== catFetchIdRef.current) return; // stale — başka kategori seçildi
        setCatDiscounts(items);
        setCatResultsFor(capturedCategory); // fetch tamamlandı, bu kategori için sonuç var
        setCatLastVisible(lv);
        catLastVisibleRef.current = lv;
        setCatHasMore(hm);
        catHasMoreRef.current = hm;
      })
      .catch(() => {
        if (fetchId !== catFetchIdRef.current) return;
        setCatResultsFor(capturedCategory); // hata durumunda da "tamamlandı" say
        setError('Kategori ilanları yüklenemedi.');
      })
      .finally(() => {
        if (fetchId !== catFetchIdRef.current) return;
        setIsLoading(false);
        catLoadingRef.current = false;
      });
  }, [selectedCategory]);

  // ── Kategori modu: sonraki sayfa yükle ───────────────────────────────────────
  const loadMoreCategory = useCallback(async () => {
    if (catLoadingRef.current || !catHasMoreRef.current || selectedCategory === 'Tümü') return;
    catLoadingRef.current = true;
    setIsLoading(true);
    try {
      // Sayfalama sayfalarında (cursor var) cache atlanır
      const result = await fetchDiscountsByCategory(selectedCategory, catLastVisibleRef.current);
      setCatDiscounts(prev => {
        const ids = new Set(prev.map(d => d.id));
        return [...prev, ...result.discounts.filter(d => !ids.has(d.id))];
      });
      setCatLastVisible(result.lastVisible);
      catLastVisibleRef.current = result.lastVisible;
      setCatHasMore(result.hasMore);
      catHasMoreRef.current = result.hasMore;
    } catch {
      setError('Daha fazla yüklenemedi.');
    } finally {
      setIsLoading(false);
      catLoadingRef.current = false;
    }
  }, [selectedCategory]);

  const handleToggleFavorite = useCallback(async (discountId: string) => {
    const next = await toggleFavoriteId(discountId);
    setFavorites(next);
  }, []);

  const filteredDiscounts = useMemo(() => {
    let source: Discount[];
    if (selectedCategory === 'Tümü') {
      source = discounts;
    } else if (catDiscounts.length > 0) {
      source = catDiscounts;
    } else {
      // Kategori verisi yüklenirken yerel feed'den anlık filtrele (algılanan gecikme sıfır)
      source = discounts.filter(d => normalizeCategory(d.category) === selectedCategory);
    }
    const lower = debouncedSearch.toLowerCase();
    const filtered = source.filter(item => {
      if (isHiddenFromFeed(item.id)) return false;
      if (!lower) return true;
      return (
        item.title.toLowerCase().includes(lower) ||
        item.brand.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
      );
    });
    // Sponsorlu ilanlar her zaman en başta sabit
    return filtered.sort((a, b) => {
      if (a.isAd && !b.isAd) return -1;
      if (!a.isAd && b.isAd) return 1;
      return 0;
    });
  }, [discounts, catDiscounts, debouncedSearch, selectedCategory]);


  type HomeSlot = { kind: 'discount'; item: Discount } | { kind: 'ad'; adKey: string };
  type HomeRow = { rowKey: string; layout: 'pair'; left: HomeSlot; right: HomeSlot | null };

  // ── Debounce: searchTerm → debouncedSearch (300ms) ───────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Arka planda ilk 3 kategoriyi prefetch et — ilk açılıştan sonra tıklamalar anında gelir
  const prefetchDoneRef = useRef(false);
  useEffect(() => {
    if (discounts.length === 0 || prefetchDoneRef.current) return;
    prefetchDoneRef.current = true;
    const timer = setTimeout(() => {
      // Sadece 1 kategori prefetch — 36 read yerine 12 (persistent cache varsa 0)
      if (allCategories[1]) {
        fetchDiscountsByCategoryCached(allCategories[1], null)
          .then(res => {
            // İlk birkaç görseli de önceden indir → kategoriye tıklayınca görseller anında gelir
            res.discounts.slice(0, 6).forEach(d => {
              if (d.imageUrl) Image.prefetch(d.imageUrl).catch(() => {});
            });
          })
          .catch(() => {});
      }
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discounts.length]);

  // ── Kategori geçişi — opacity sıfıra indirilmez, skeleton zaten geçişi yönetir ─

  // ── Arama fade — hafif solma, kararma değil ──────────────────────
  useEffect(() => {
    if (!debouncedSearch && !searchTerm) return;
    listFade.stopAnimation();
    Animated.sequence([
      Animated.timing(listFade, { toValue: 0.75, duration: 60, useNativeDriver: true }),
      Animated.timing(listFade, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ── Kategori veya arama değişince scroll'a dön ────────────────────
  useEffect(() => {
    flatListRef.current?.scrollToOffset({ animated: false, offset: 0 });
  }, [selectedCategory, searchTerm]);

  // ── Stable story-press handler ─────────────────────────────────────
  const handleStoryPress = useCallback((story: Story) => {
    const tappedIndex = sortedStories.indexOf(story);
    const tappedSeen  = viewedStoryIds.includes(story.id);
    const firstUnseen = sortedStories.findIndex(s => !viewedStoryIds.includes(s.id));
    const initialIndex = tappedSeen && firstUnseen !== -1 ? firstUnseen : tappedIndex;
    navigation.navigate('StoryDetail', { stories: sortedStories, initialIndex });
  }, [navigation, sortedStories, viewedStoryIds]);

  // Stories bar arama yokken tüm kategorilerde görünsün
  const showStoriesBar = !debouncedSearch;

  // selectedCategory değişip useEffect henüz tamamlanmadıysa true:
  // setSelectedCategory → render (isLoading henüz false) → useEffect tetiklenir
  // Bu tek-frame boşlukta empty state göstermemek için kullanılır.
  const isCategoryPending = selectedCategory !== 'Tümü' && catResultsFor !== selectedCategory;

  const listItems = useMemo<HomeRow[]>(() => {
    // Düz slot dizisi: her 6 ilandan sonra 1 reklam ekle.
    // 6 ilan + 1 reklam = 7 (tek sayı) → 2'şerli pair'lere bölününce reklam
    // bir satırda solda, sonrakinde sağda... şeklinde dönüşümlü yer alır.
    const slots: HomeSlot[] = [];
    let adCount = 0;
    for (let i = 0; i < filteredDiscounts.length; i++) {
      slots.push({ kind: 'discount', item: filteredDiscounts[i] });
      // Anasayfa native reklamı — AdMob onayına kadar KAPALI (tüm native'ler kapalı)
      if (EXTRA_AD_PLACEMENTS && (i + 1) % 6 === 0) {
        slots.push({ kind: 'ad', adKey: `home-ad-${adCount}` });
        adCount++;
      }
    }

    const rows: HomeRow[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      rows.push({
        rowKey: `home-row-${i}`,
        layout: 'pair',
        left: slots[i],
        right: slots[i + 1] ?? null,
      });
    }
    return rows;
  }, [filteredDiscounts]);

  const renderDiscountSlot = useCallback((slot: HomeSlot | null) => {
    if (!slot) return <View style={styles.cardWrapper} />;
    if (slot.kind === 'ad') {
      return (
        <View style={styles.cardWrapper}>
          <NativeAdCard compact cacheKey={slot.adKey} />
        </View>
      );
    }
    return (
      <View key={slot.item.id} style={styles.cardWrapper}>
        <DiscountCard
          discount={slot.item}
          isFavorite={favorites.includes(slot.item.id)}
          onToggleFavorite={() => handleToggleFavorite(slot.item.id)}
          isExpired={isDiscountExpired(slot.item)}
          discountList={filteredDiscounts}
        />
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, filteredDiscounts, handleToggleFavorite]);

  const renderItem = useCallback(({ item }: { item: HomeRow }) => {
    return (
      <View style={styles.row}>
        {renderDiscountSlot(item.left)}
        {renderDiscountSlot(item.right)}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderDiscountSlot]);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const headerBg = isDark ? Colors.gray800 : Colors.white;
  const inputBg = isDark ? Colors.gray700 : Colors.gray100;
  const textColor = isDark ? Colors.white : Colors.gray800;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* ── Sticky üst: İNDİVA + arama + bildirim ── her zaman sabit */}
      <View style={[styles.stickyTop, { backgroundColor: headerBg }]}>
        <View style={[styles.headerRow, { paddingTop: insets.top }]}>
          <Text style={[styles.logo, { color: Colors.orange }]}>İNDİVA</Text>
          <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Ara..."
              placeholderTextColor={isDark ? Colors.gray400 : Colors.gray500}
              value={searchTerm}
              onChangeText={setSearchTerm}
              returnKeyType="search"
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity onPress={() => setSearchTerm('')}>
                <Text style={{ color: Colors.gray400, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <Animated.View style={{ transform: [{ scale: bellPulse }] }}>
            <TouchableOpacity
              style={[styles.bellBtn, { backgroundColor: inputBg }]}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Offline banner */}
      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: isDark ? '#451a03' : '#fffbeb' }]}>
          <Text style={{ color: isDark ? '#fde68a' : '#92400e', fontSize: 13 }}>
            📡 İnternet bağlantısı yok — son yüklenen ilanlar gösteriliyor
          </Text>
        </View>
      )}

      {/* Error banner */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? '#1f0e0e' : Colors.red50 }]}>
          <Text style={{ color: isDark ? Colors.red300 : Colors.red700, fontSize: 13 }}>{error}</Text>
          <TouchableOpacity onPress={loadInitial} style={styles.retryBtn}>
            <Text style={{ color: Colors.orange, fontWeight: '700', fontSize: 13 }}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Initial skeleton loader with shimmer */}
      {(isLoading || isCategoryPending) && filteredDiscounts.length === 0 && !error && (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Animated.View
              key={i}
              style={[
                styles.skeletonCard,
                {
                  backgroundColor: isDark ? Colors.gray800 : Colors.gray200,
                  opacity: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, i % 2 === 0 ? 0.45 : 0.6],
                  }),
                },
              ]}
            >
              <View style={[styles.skeletonImage, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
              <View style={styles.skeletonContent}>
                <View style={[styles.skeletonLine, { width: '40%', backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
                <View style={[styles.skeletonLine, { width: '90%', backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
                <View style={[styles.skeletonLine, { width: '75%', backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
                <View style={[styles.skeletonPriceRow]}>
                  <View style={[styles.skeletonPriceBox, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
                  <View style={[styles.skeletonPriceBox, { backgroundColor: Colors.orange + '30' }]} />
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      <Animated.FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={(item: HomeRow) => item.rowKey}
        renderItem={renderItem}
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={4}
        initialNumToRender={4}
        updateCellsBatchingPeriod={30}
        style={{ flex: 1, opacity: listFade, display: (isLoading || isCategoryPending) && filteredDiscounts.length === 0 ? 'none' : 'flex' }}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
        ListHeaderComponent={
          /* Story bar + kategori filtreleri — listeyle birlikte kayar */
          <View style={[styles.scrollableHeader, { backgroundColor: headerBg }]}>
            {showStoriesBar && (
              <StoriesBar
                stories={sortedStories}
                loading={storiesLoading}
                viewedIds={viewedStoryIds}
                onPress={handleStoryPress}
              />
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesContent}
              style={[styles.categoriesScroll, !showStoriesBar && styles.categoriesTopPad]}
            >
              {allCategories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor:
                        selectedCategory === cat ? Colors.orange : (isDark ? Colors.gray700 : Colors.gray100),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.catText,
                      { color: selectedCategory === cat ? Colors.white : (isDark ? Colors.gray300 : Colors.gray600) },
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          !isLoading && !error && !isCategoryPending ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
              <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 16, fontWeight: '700' }}>
                {discounts.length > 0
                  ? 'Kriterlerinize uygun indirim yok.'
                  : 'Şu an indirim bulunmuyor.'}
              </Text>
            </View>
          ) : null
        }
        onEndReached={() => {
          if (selectedCategory === 'Tümü') loadMore();
          else loadMoreCategory();
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.orange}
            colors={[Colors.orange]}
          />
        }
        ListFooterComponent={
          isLoading && discounts.length > 0 ? (
            <ActivityIndicator color={Colors.orange} style={{ marginVertical: 20 }} />
          ) : !hasMore && discounts.length > 0 ? (
            <View style={styles.allDoneContainer}>
              <Text style={{ fontSize: 36 }}>🎉</Text>
              <Text style={{ color: isDark ? Colors.gray200 : Colors.gray700, fontWeight: '800', marginTop: 8 }}>
                Hepsi bu!
              </Text>
              <Text style={{ color: Colors.gray400, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                Tüm fırsatları gördünüz.{'\n'}Yeni indirimler için takipte kalın.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Exit confirmation modal */}
      <Modal visible={showExitModal} transparent animationType="fade">
        <View style={styles.exitOverlay}>
          <View style={[styles.exitCard, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>👋</Text>
            <Text style={[styles.exitTitle, { color: isDark ? Colors.white : Colors.gray900 }]}>
              Çıkmak istiyor musun?
            </Text>
            <Text style={[styles.exitSubtitle, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
              Kaçırdığın fırsatlar olabilir!
            </Text>
            <View style={styles.exitButtons}>
              <TouchableOpacity
                style={[styles.exitBtn, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]}
                onPress={() => setShowExitModal(false)}
              >
                <Text style={[styles.exitBtnText, { color: isDark ? Colors.gray200 : Colors.gray700 }]}>
                  Hayır, Kal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exitBtn, { backgroundColor: Colors.orange }]}
                onPress={() => BackHandler.exitApp()}
              >
                <Text style={[styles.exitBtnText, { color: Colors.white }]}>Çık</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Story bar + kategori filtreleri — her zaman ekranın üstünde sabit kalır
  stickyTop: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  // Story bar + kategori filtreleri — ListHeaderComponent içinde, listeyle kayar
  scrollableHeader: {
    marginHorizontal: -8,
    marginTop: -4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    flexShrink: 0,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  bellIcon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.red500,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  categoriesScroll: { marginTop: 8, marginBottom: 8 },
  // Story bar yokken (kategori seçili / arama) üstte küçük boşluk ekle
  categoriesTopPad: { marginTop: 6 },
  categoriesContent: { paddingHorizontal: 12, gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  catText: { fontSize: 12, fontWeight: '600' },
  offlineBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  errorBanner: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.red500,
  },
  retryBtn: { marginTop: 8 },
  listContainer: { padding: 8, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  cardWrapper: { flex: 1 },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  skeletonCard: {
    width: '47%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 0,
  },
  skeletonContent: {
    padding: 10,
    gap: 8,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
  },
  skeletonPriceRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  skeletonPriceBox: {
    flex: 1,
    height: 28,
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  allDoneContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  exitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  exitCard: {
    width: '100%',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  exitTitle: { fontSize: 20, fontWeight: '900', marginBottom: 6 },
  exitSubtitle: { fontSize: 13, marginBottom: 24 },
  exitButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  exitBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  exitBtnText: { fontSize: 15, fontWeight: '800' },
});
