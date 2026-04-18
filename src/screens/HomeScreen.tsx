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
} from 'react-native';
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { fetchDiscounts, fetchDiscountsByCategory, getOfflineCache } from '../services/firebaseService';
import { getVotes, isDiscountExpired, isHiddenFromFeed, loadVotesCache, Votes } from '../services/voteService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Discount } from '../types';
import DiscountCard from '../components/DiscountCard';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { CATEGORIES, normalizeCategory } from '../constants/categories';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const BANNER_AD_UNIT_ID = __DEV__
  ? 'ca-app-pub-3940256099942544/6300978111'
  : 'ca-app-pub-3675503435035155/8261572668';

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
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastVisible, setLastVisible] = useState<FirebaseFirestoreTypes.QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [votes, setVotes] = useState<Votes>({});
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [categoryDiscounts, setCategoryDiscounts] = useState<Discount[]>([]);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [categoryLastVisible, setCategoryLastVisible] = useState<FirebaseFirestoreTypes.QueryDocumentSnapshot | null>(null);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [isCategoryLoadingMore, setIsCategoryLoadingMore] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const isLoadingRef = useRef(false);
  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

  const allCategories = useMemo(() => {
    if (discounts.length === 0) return ['Tümü', ...CATEGORIES];
    const counts: Record<string, number> = {};
    for (const d of discounts) {
      const cat = normalizeCategory(d.category);
      if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
    }
    const sorted = CATEGORIES.slice().sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
    return ['Tümü', ...sorted];
  }, [discounts]);

  useEffect(() => {
    loadVotesCache().then(() => setVotes(getVotes()));
    loadInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(useCallback(() => {
    const onBack = () => { setShowExitModal(true); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []));

  // Sekme odağa geldiğinde favorileri yenile (FavoritesScreen'deki değişiklikler yansısın)
  useFocusEffect(useCallback(() => {
    getFavoriteIds().then(setFavorites);
  }, []));

  useEffect(() => {
    if (selectedCategory === 'Tümü') {
      setCategoryDiscounts([]);
      setCategoryLastVisible(null);
      setCategoryHasMore(false);
      return;
    }
    setIsCategoryLoading(true);
    setCategoryDiscounts([]);
    setCategoryLastVisible(null);
    fetchDiscountsByCategory(selectedCategory, null)
      .then(result => {
        setCategoryDiscounts(result.discounts);
        setCategoryLastVisible(result.lastVisible);
        setCategoryHasMore(result.hasMore);
      })
      .finally(() => setIsCategoryLoading(false));
  }, [selectedCategory]);

  const loadInitial = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDiscounts(null);
      setDiscounts(result.discounts);
      setLastVisible(result.lastVisible);
      setHasMore(result.hasMore);
    } catch {
      const cached = await getOfflineCache();
      if (cached.length > 0) {
        setDiscounts(cached);
        setIsOffline(true);
      } else {
        setError('İndirimler yüklenemedi. İnternet bağlantınızı kontrol edin.');
      }
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore || searchTerm || selectedCategory !== 'Tümü') return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const result = await fetchDiscounts(lastVisible);
      if (result.discounts.length > 0) {
        setDiscounts(prev => [...prev, ...result.discounts]);
        setLastVisible(result.lastVisible);
      }
      setHasMore(result.hasMore);
    } catch {
      setError('Daha fazla yüklenemedi.');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [hasMore, lastVisible, searchTerm, selectedCategory]);

  const loadMoreCategory = useCallback(async () => {
    if (isLoadingRef.current || !categoryHasMore || isCategoryLoadingMore) return;
    isLoadingRef.current = true;
    setIsCategoryLoadingMore(true);
    try {
      const result = await fetchDiscountsByCategory(selectedCategory, categoryLastVisible);
      if (result.discounts.length > 0) {
        setCategoryDiscounts(prev => [...prev, ...result.discounts]);
      }
      setCategoryLastVisible(result.lastVisible);
      setCategoryHasMore(result.hasMore);
    } finally {
      setIsCategoryLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [categoryHasMore, categoryLastVisible, isCategoryLoadingMore, selectedCategory]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await loadVotesCache();
      setVotes(getVotes());
      const result = await fetchDiscounts(null);
      setDiscounts(result.discounts);
      setLastVisible(result.lastVisible);
      setHasMore(result.hasMore);
      setIsOffline(false);
    } catch {
      setError('Yenilenirken hata oluştu.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleToggleFavorite = useCallback(async (discountId: string) => {
    const next = await toggleFavoriteId(discountId);
    setFavorites(next);
  }, []);

  const filteredDiscounts = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    const source = selectedCategory === 'Tümü' ? discounts : categoryDiscounts;
    return source.filter(item => {
      if (isHiddenFromFeed(item.id)) return false;
      if (!lower) return true;
      return (
        item.title.toLowerCase().includes(lower) ||
        item.brand.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
      );
    });
  }, [discounts, categoryDiscounts, searchTerm, selectedCategory, votes]);

  type HomeRow =
    | { type: 'pair'; left: Discount; right: Discount | null; pairIndex: number }
    | { type: 'adCard'; key: string };

  const listItems = useMemo<HomeRow[]>(() => {
    const rows: HomeRow[] = [];
    let pairCount = 0;
    for (let i = 0; i < filteredDiscounts.length; i += 2) {
      rows.push({
        type: 'pair',
        left: filteredDiscounts[i],
        right: filteredDiscounts[i + 1] ?? null,
        pairIndex: i,
      });
      pairCount++;
      // Her 2 çiftten (4 ilandan) sonra reklam kartı ekle
      if (pairCount % 2 === 0) {
        rows.push({ type: 'adCard', key: `ad-${i}` });
      }
    }
    return rows;
  }, [filteredDiscounts]);

  const renderItem = ({ item }: { item: HomeRow }) => {
    if (item.type === 'adCard') {
      return (
        <View style={[styles.adCard, { backgroundColor: cardBg }]}>
          <View style={styles.sponsoredBadge}>
            <Text style={styles.sponsoredText}>Sponsorlu</Text>
          </View>
          <BannerAd
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      );
    }

    return (
      <View style={styles.row}>
        <View style={styles.cardWrapper}>
          <DiscountCard
            discount={item.left}
            isFavorite={favorites.includes(item.left.id)}
            onToggleFavorite={() => handleToggleFavorite(item.left.id)}
            isExpired={isDiscountExpired(item.left.id, votes)}
            discountList={filteredDiscounts}
          />
        </View>
        <View style={styles.cardWrapper}>
          {item.right ? (
            <DiscountCard
              discount={item.right}
              isFavorite={favorites.includes(item.right.id)}
              onToggleFavorite={() => handleToggleFavorite(item.right!.id)}
              isExpired={isDiscountExpired(item.right.id, votes)}
              discountList={filteredDiscounts}
            />
          ) : (
            <View style={styles.cardWrapper} />
          )}
        </View>
      </View>
    );
  };

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const headerBg = isDark ? Colors.gray800 : Colors.white;
  const inputBg = isDark ? Colors.gray700 : Colors.gray100;
  const textColor = isDark ? Colors.white : Colors.gray800;
  const cardBg = isDark ? Colors.gray800 : Colors.white;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Sticky header */}
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        {/* Tek satır: logo + arama çubuğu + bildirim butonu */}
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
        </View>
        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContent}
          style={styles.categoriesScroll}
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

      {/* Initial skeleton loader */}
      {(isLoading && discounts.length === 0 || isCategoryLoading) && !error && (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: isDark ? Colors.gray800 : Colors.gray200 }]} />
          ))}
        </View>
      )}

      {/* Discount list */}
      {filteredDiscounts.length === 0 && !isLoading && !isCategoryLoading && !error ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
          <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 16, fontWeight: '700' }}>
            {discounts.length > 0 ? 'Kriterlerinize uygun indirim yok.' : 'Şu an indirim bulunmuyor.'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listItems}
          keyExtractor={(item, index) =>
            item.type === 'pair' ? `pair_${item.pairIndex}_${index}` : item.key
          }
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
          onEndReached={selectedCategory === 'Tümü' ? loadMore : loadMoreCategory}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.orange}
              colors={[Colors.orange]}
            />
          }
          ListFooterComponent={
            (isLoading && discounts.length > 0) || isCategoryLoadingMore ? (
              <ActivityIndicator color={Colors.orange} style={{ marginVertical: 20 }} />
            ) : selectedCategory === 'Tümü' && !hasMore && discounts.length > 0 ? (
              <View style={styles.allDoneContainer}>
                <Text style={{ fontSize: 36 }}>🎉</Text>
                <Text style={{ color: isDark ? Colors.gray200 : Colors.gray700, fontWeight: '800', marginTop: 8 }}>
                  Hepsi bu!
                </Text>
                <Text style={{ color: Colors.gray400, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  Tüm fırsatları gördünüz.{'\n'}Yeni indirimler için takipte kalın.
                </Text>
              </View>
            ) : selectedCategory !== 'Tümü' && !categoryHasMore && categoryDiscounts.length > 0 ? (
              <View style={styles.allDoneContainer}>
                <Text style={{ fontSize: 36 }}>🎉</Text>
                <Text style={{ color: isDark ? Colors.gray200 : Colors.gray700, fontWeight: '800', marginTop: 8 }}>
                  Hepsi bu!
                </Text>
                <Text style={{ color: Colors.gray400, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  Bu kategorideki tüm fırsatları gördünüz.
                </Text>
              </View>
            ) : null
          }
        />
      )}

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
  header: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'PlayfairDisplay-VariableFont_wght',
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
  categoriesScroll: { marginBottom: 10 },
  categoriesContent: { paddingHorizontal: 14, gap: 8 },
  catChip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
  },
  catText: { fontSize: 13, fontWeight: '700' },
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
  listContainer: { padding: 8 },
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
    aspectRatio: 0.75,
    borderRadius: 12,
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
  adCard: {
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 80,
  },
  sponsoredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  sponsoredText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
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
