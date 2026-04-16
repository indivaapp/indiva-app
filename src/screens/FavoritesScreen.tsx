import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getDiscountById } from '../services/firebaseService';
import { getVotes, isDiscountExpired, Votes, loadVotesCache } from '../services/voteService';
import type { Discount } from '../types';
import DiscountCard from '../components/DiscountCard';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function FavoritesScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [favoriteDiscounts, setFavoriteDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [votes, setVotes] = useState<Votes>({});
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  const fetchFavorites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadVotesCache();
      setVotes(getVotes());
      const stored = await AsyncStorage.getItem('favoriteDiscounts');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (ids.length === 0) {
        setFavoriteDiscounts([]);
        return;
      }
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

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? Colors.gray800 : Colors.white, paddingTop: insets.top }]}>
        <Text style={[styles.headerTitle, { color: isDark ? Colors.white : Colors.gray800 }]}>❤️ Favorilerim</Text>
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50 }]}>
          <Text style={{ color: Colors.red500 }}>{error}</Text>
          <TouchableOpacity onPress={fetchFavorites}>
            <Text style={{ color: Colors.orange, fontWeight: '700', marginTop: 6 }}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {favoriteDiscounts.length === 0 && !error ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBox, { backgroundColor: isDark ? Colors.gray800 : Colors.gray100 }]}>
            <Text style={{ fontSize: 40 }}>🤍</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: textColor }]}>Listeniz Boş</Text>
          <Text style={[styles.emptyBody, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
            Henüz favori indiriminiz bulunmuyor.{'\n'}İndirim kartlarındaki kalp ikonuna dokunarak buraya ekleyebilirsiniz.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs')}
            style={styles.exploreBtn}
          >
            <Text style={styles.exploreBtnText}>İndirimleri Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={favoriteDiscounts.length % 2 !== 0 ? [...favoriteDiscounts, null] : favoriteDiscounts}
          keyExtractor={item => item ? item.id : '__placeholder__'}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
          renderItem={({ item }) => (
            <View style={styles.cardWrapper}>
              {item ? (
                <DiscountCard
                  discount={item}
                  isFavorite
                  onToggleFavorite={() => handleRemoveFavorite(item.id)}
                  isExpired={isDiscountExpired(item.id, votes)}
                  discountList={favoriteDiscounts}
                />
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', paddingTop: 10 },
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
  row: { gap: 8, marginBottom: 8 },
  cardWrapper: { flex: 1 },
});
