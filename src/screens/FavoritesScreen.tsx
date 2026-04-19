import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getDiscountById } from '../services/firebaseService';
import { getVotes, isDiscountExpired, Votes, loadVotesCache } from '../services/voteService';
import type { Discount } from '../types';
import DiscountCard from '../components/DiscountCard';
import NativeAdCard from '../components/NativeAdCard';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type FavSlot = { kind: 'discount'; item: Discount } | { kind: 'ad'; adKey: string };
type FavRow = { rowKey: string; left: FavSlot; right: FavSlot | null };

export default function FavoritesScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const flatListRef = useRef<any>(null);
  useScrollToTop(flatListRef);

  const [favoriteDiscounts, setFavoriteDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [votes, setVotes] = useState<Votes>({});
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const textColor = isDark ? Colors.white : Colors.gray800;

  const fetchFavorites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadVotesCache();
      setVotes(getVotes());
      const stored = await AsyncStorage.getItem('favoriteDiscounts');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (ids.length === 0) { setFavoriteDiscounts([]); return; }
      const results = await Promise.all(ids.map(id => getDiscountById(id).catch(() => null)));
      setFavoriteDiscounts(results.filter((d): d is Discount => d !== null));
    } catch {
      setError('Favoriler yüklenirken bir sorun oluştu.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchFavorites(); }, [fetchFavorites]));

  const handleRemoveFavorite = async (discountId: string) => {
    setFavoriteDiscounts(prev => prev.filter(d => d.id !== discountId));
    const stored = await AsyncStorage.getItem('favoriteDiscounts');
    const ids: string[] = stored ? JSON.parse(stored) : [];
    await AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(ids.filter(id => id !== discountId)));
  };

  // Slot tabanlı liste: 4 ilan → 1 reklam → 4 ilan → ...
  const listItems = useMemo<FavRow[]>(() => {
    const slots: FavSlot[] = [];
    let adCount = 0;
    for (let i = 0; i < favoriteDiscounts.length; i++) {
      slots.push({ kind: 'discount', item: favoriteDiscounts[i] });
      if ((i + 1) % 4 === 0) {
        adCount++;
        slots.push({ kind: 'ad', adKey: `fav-ad-${adCount}` });
      }
    }
    const rows: FavRow[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      rows.push({ rowKey: `fav-row-${i}`, left: slots[i], right: slots[i + 1] ?? null });
    }
    return rows;
  }, [favoriteDiscounts]);

  const renderSlot = (slot: FavSlot | null) => {
    if (!slot) return <View style={styles.cardWrapper} />;
    if (slot.kind === 'ad') {
      return (
        <View style={styles.cardWrapper}>
          <NativeAdCard />
        </View>
      );
    }
    return (
      <View style={styles.cardWrapper}>
        <DiscountCard
          discount={slot.item}
          isFavorite
          onToggleFavorite={() => handleRemoveFavorite(slot.item.id)}
          isExpired={isDiscountExpired(slot.item.id, votes)}
          discountList={favoriteDiscounts}
        />
      </View>
    );
  };

  const renderItem = ({ item }: { item: FavRow }) => (
    <View style={styles.row}>
      {renderSlot(item.left)}
      {renderSlot(item.right)}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {error && (
        <View style={[styles.errorBox, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50 }]}>
          <Text style={{ color: Colors.red500 }}>{error}</Text>
          <TouchableOpacity onPress={fetchFavorites}>
            <Text style={{ color: Colors.orange, fontWeight: '700', marginTop: 6 }}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {favoriteDiscounts.length === 0 && !error ? (
        <View style={[styles.emptyContainer, { paddingTop: insets.top }]}>
          <View style={[styles.emptyIconBox, { backgroundColor: isDark ? Colors.gray800 : Colors.gray100 }]}>
            <Text style={{ fontSize: 40 }}>🤍</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: textColor }]}>Listeniz Boş</Text>
          <Text style={[styles.emptyBody, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
            Henüz favori indiriminiz bulunmuyor.{'\n'}İndirim kartlarındaki kalp ikonuna dokunarak buraya ekleyebilirsiniz.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' } as any)}
            style={styles.exploreBtn}
          >
            <Text style={styles.exploreBtnText}>İndirimleri Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listItems}
          keyExtractor={item => item.rowKey}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 80 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    margin: 12,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.red500,
  },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  exploreBtn: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 14,
  },
  exploreBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  listContainer: { padding: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardWrapper: { flex: 1 },
});
