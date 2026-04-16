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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { fetchDiscounts, getOfflineCache } from '../services/firebaseService';
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

// In production replace with your real ad unit IDs:
// Card-slot ad (INLINE_ADAPTIVE_BANNER — fills card width, blends into 2-column grid)
const CARD_AD_UNIT_ID = __DEV__
  ? TestIds.INLINE_ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

// Row banner ad (ANCHORED_ADAPTIVE_BANNER — full-width strip between rows)
const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
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
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastVisible, setLastVisible] = useState<FirebaseFirestoreTypes.QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [votes, setVotes] = useState<Votes>({});
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const isLoadingRef = useRef(false);

  const allCategories = ['Tümü', ...CATEGORIES];

  useEffect(() => {
    loadVotesCache().then(() => setVotes(getVotes()));
    loadInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sekme odağa geldiğinde favorileri yenile (FavoritesScreen'deki değişiklikler yansısın)
  useFocusEffect(useCallback(() => {
    getFavoriteIds().then(setFavorites);
  }, []));

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
    return discounts.filter(item => {
      if (isHiddenFromFeed(item.id)) return false;
      const matchSearch =
        !lower ||
        item.title.toLowerCase().includes(lower) ||
        item.brand.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower);
      const matchCat =
        selectedCategory === 'Tümü' || normalizeCategory(item.category) === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [discounts, searchTerm, selectedCategory, votes]);

  // Build list rows: 3 pairs → card-ad → 2 pairs → banner → repeat
  // Card-ad sits in the grid like a discount card; banner is a full-width strip
  type HomeRow =
    | { type: 'pair'; left: Discount; right: Discount | null; pairIndex: number }
    | { type: 'card-ad'; key: string }
    | { type: 'banner'; key: string };

  const listItems = useMemo<HomeRow[]>(() => {
    const rows: HomeRow[] = [];
    let i = 0;

    while (i < filteredDiscounts.length) {
      // 3 pairs of cards = 6 discounts
      for (let p = 0; p < 3 && i < filteredDiscounts.length; p++) {
        rows.push({
          type: 'pair',
          left: filteredDiscounts[i],
          right: filteredDiscounts[i + 1] ?? null,
          pairIndex: i,
        });
        i += 2;
      }

      // Card-sized ad (blends into the grid, same card style)
      rows.push({ type: 'card-ad', key: `card-ad-${i}` });

      // 2 more pairs = 4 discounts (then banner comes)
      for (let p = 0; p < 2 && i < filteredDiscounts.length; p++) {
        rows.push({
          type: 'pair',
          left: filteredDiscounts[i],
          right: filteredDiscounts[i + 1] ?? null,
          pairIndex: i,
        });
        i += 2;
      }

      // Full-width banner strip (2 rows after the card-ad)
      rows.push({ type: 'banner', key: `banner-${i}` });
    }

    return rows;
  }, [filteredDiscounts]);

  const renderItem = ({ item }: { item: HomeRow }) => {
    // Card-slot ad: full-width container styled like a card row, fills grid width
    if (item.type === 'card-ad') {
      return (
        <View style={[styles.cardAdContainer, { backgroundColor: cardBg }]}>
          <BannerAd
            unitId={CARD_AD_UNIT_ID}
            size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      );
    }

    // Full-width banner strip
    if (item.type === 'banner') {
      return (
        <View style={styles.adContainer}>
          <BannerAd
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      );
    }

    // Normal discount pair row
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
      {isLoading && discounts.length === 0 && !error && (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: isDark ? Colors.gray800 : Colors.gray200 }]} />
          ))}
        </View>
      )}

      {/* Discount list */}
      {filteredDiscounts.length === 0 && !isLoading && !error ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
          <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 16, fontWeight: '700' }}>
            {discounts.length > 0 ? 'Kriterlerinize uygun indirim yok.' : 'Şu an indirim bulunmuyor.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, index) =>
            item.type === 'pair' ? `pair_${item.pairIndex}_${index}` : item.key
          }
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
          onEndReached={loadMore}
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
      )}
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
  categoriesScroll: { marginBottom: 8 },
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
  // Card-slot ad: mimics the look of a content card row
  cardAdContainer: {
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 3,
  },
  // Banner strip: centered, full-width
  adContainer: {
    alignItems: 'center',
    marginVertical: 4,
    overflow: 'hidden',
  },
});
